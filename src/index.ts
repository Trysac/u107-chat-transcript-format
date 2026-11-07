/**
 * Public API for @trysac/chat-transcript-format.
 * Supports lossless chat transcript conversion across OpenAI, Anthropic, and Gemini formats.
 */

export type Format = "openai" | "anthropic" | "gemini";

export type Part =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string };

export interface TranscriptMessage {
  role: "user" | "assistant";
  parts: Part[];
}

export interface Transcript {
  system?: string;
  messages: TranscriptMessage[];
}

export interface Limits {
  maxMessages?: number;
  maxChars?: number;
}

export type TranscriptErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_ROLE"
  | "UNSUPPORTED_PART"
  | "TOO_MANY_MESSAGES"
  | "TOO_LARGE";

export class TranscriptError extends Error {
  readonly code: TranscriptErrorCode;
  readonly path: string;

  constructor(code: TranscriptErrorCode, path: string, message: string) {
    super(message.length > 200 ? `${message.slice(0, 197)}...` : message);
    this.name = "TranscriptError";
    this.code = code;
    this.path = path;
    Object.setPrototypeOf(this, TranscriptError.prototype);
  }
}

const DEFAULT_MAX_MESSAGES = 10_000;
const DEFAULT_MAX_CHARS = 1_000_000;

const DATA_URL_REGEX = /^data:([^;,]+);base64,(.+)$/s;

interface ResolvedLimits {
  maxMessages: number;
  maxChars: number;
}

function resolveLimits(opts?: Limits): ResolvedLimits {
  return {
    maxMessages: opts?.maxMessages ?? DEFAULT_MAX_MESSAGES,
    maxChars: opts?.maxChars ?? DEFAULT_MAX_CHARS,
  };
}

function checkChars(
  text: string,
  currentTotal: number,
  path: string,
  limits: ResolvedLimits,
): number {
  const nextTotal = currentTotal + text.length;
  if (nextTotal > limits.maxChars) {
    throw new TranscriptError(
      "TOO_LARGE",
      path,
      `Exceeded maxChars limit of ${limits.maxChars} at path '${path}'`,
    );
  }
  return nextTotal;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function parseDataUrl(url: string, path: string): { mediaType: string; data: string } {
  const match = DATA_URL_REGEX.exec(url);
  if (!match || !match[1] || !match[2]) {
    throw new TranscriptError(
      "UNSUPPORTED_PART",
      path,
      `Unsupported image URL format (only base64 data URLs allowed): ${url}`,
    );
  }
  return {
    mediaType: match[1],
    data: match[2],
  };
}

function parseOpenAI(input: unknown, limits: ResolvedLimits): Transcript {
  if (!Array.isArray(input)) {
    throw new TranscriptError(
      "INVALID_INPUT",
      "root",
      "Expected array of messages for OpenAI transcript",
    );
  }

  let totalChars = 0;
  const systemParts: string[] = [];
  const messages: TranscriptMessage[] = [];

  for (let i = 0; i < input.length; i++) {
    const item = input[i];
    const itemPath = `[${i}]`;

    if (!isObject(item)) {
      throw new TranscriptError(
        "INVALID_INPUT",
        itemPath,
        `Message at ${itemPath} must be an object`,
      );
    }

    if (!("role" in item) || typeof item.role !== "string") {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.role`,
        `Missing or invalid role at ${itemPath}.role`,
      );
    }

    const role = item.role;
    if (role === "tool" || role === "function") {
      throw new TranscriptError(
        "UNSUPPORTED_ROLE",
        `${itemPath}.role`,
        `Unsupported role '${role}' at ${itemPath}.role`,
      );
    }
    if (role !== "system" && role !== "developer" && role !== "user" && role !== "assistant") {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.role`,
        `Unknown role '${role}' at ${itemPath}.role`,
      );
    }

    const content = item.content;
    const contentParts: Part[] = [];

    if (typeof content === "string") {
      totalChars = checkChars(content, totalChars, `${itemPath}.content`, limits);
      if (role === "system" || role === "developer") {
        systemParts.push(content);
        continue;
      }
      contentParts.push({ type: "text", text: content });
    } else if (Array.isArray(content)) {
      for (let j = 0; j < content.length; j++) {
        const p = content[j];
        const partPath = `${itemPath}.content[${j}]`;
        if (!isObject(p) || typeof p.type !== "string") {
          throw new TranscriptError("INVALID_INPUT", partPath, `Invalid part at ${partPath}`);
        }

        if (p.type === "text") {
          if (typeof p.text !== "string") {
            throw new TranscriptError(
              "INVALID_INPUT",
              `${partPath}.text`,
              `Expected text string at ${partPath}.text`,
            );
          }
          totalChars = checkChars(p.text, totalChars, `${partPath}.text`, limits);
          if (role === "system" || role === "developer") {
            systemParts.push(p.text);
          } else {
            contentParts.push({ type: "text", text: p.text });
          }
        } else if (p.type === "image_url") {
          if (role === "system" || role === "developer") {
            throw new TranscriptError(
              "UNSUPPORTED_PART",
              partPath,
              `Image parts not supported in ${role} messages`,
            );
          }
          if (!isObject(p.image_url) || typeof p.image_url.url !== "string") {
            throw new TranscriptError(
              "INVALID_INPUT",
              `${partPath}.image_url.url`,
              `Invalid image_url object at ${partPath}`,
            );
          }
          const parsed = parseDataUrl(p.image_url.url, `${partPath}.image_url.url`);
          contentParts.push({ type: "image", mediaType: parsed.mediaType, data: parsed.data });
        } else {
          throw new TranscriptError(
            "UNSUPPORTED_PART",
            `${partPath}.type`,
            `Unsupported part type '${p.type}' at ${partPath}`,
          );
        }
      }
      if (role === "system" || role === "developer") {
        continue;
      }
    } else {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.content`,
        `Missing or invalid content at ${itemPath}.content`,
      );
    }

    messages.push({
      role: role as "user" | "assistant",
      parts: contentParts,
    });

    if (messages.length > limits.maxMessages) {
      throw new TranscriptError(
        "TOO_MANY_MESSAGES",
        "messages",
        `Exceeded maxMessages limit of ${limits.maxMessages}`,
      );
    }
  }

  const transcript: Transcript = { messages };
  if (systemParts.length > 0) {
    transcript.system = systemParts.join("\n\n");
  }
  return transcript;
}

function parseAnthropic(input: unknown, limits: ResolvedLimits): Transcript {
  if (!isObject(input)) {
    throw new TranscriptError("INVALID_INPUT", "root", "Expected object for Anthropic transcript");
  }

  let totalChars = 0;
  let system: string | undefined;

  if ("system" in input && input.system !== undefined) {
    if (typeof input.system !== "string") {
      throw new TranscriptError("INVALID_INPUT", "system", "Expected string for system prompt");
    }
    if (input.system.length > 0) {
      totalChars = checkChars(input.system, totalChars, "system", limits);
      system = input.system;
    }
  }

  if (!("messages" in input) || !Array.isArray(input.messages)) {
    throw new TranscriptError("INVALID_INPUT", "messages", "Missing or invalid messages array");
  }

  const messages: TranscriptMessage[] = [];

  for (let i = 0; i < input.messages.length; i++) {
    const item = input.messages[i];
    const itemPath = `messages[${i}]`;

    if (!isObject(item)) {
      throw new TranscriptError(
        "INVALID_INPUT",
        itemPath,
        `Message at ${itemPath} must be an object`,
      );
    }

    if (!("role" in item) || typeof item.role !== "string") {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.role`,
        `Missing or invalid role at ${itemPath}.role`,
      );
    }

    const role = item.role;
    if (role === "tool" || role === "function") {
      throw new TranscriptError(
        "UNSUPPORTED_ROLE",
        `${itemPath}.role`,
        `Unsupported role '${role}' at ${itemPath}.role`,
      );
    }
    if (role !== "user" && role !== "assistant") {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.role`,
        `Unsupported role '${role}' in Anthropic messages`,
      );
    }

    const content = item.content;
    const parts: Part[] = [];

    if (typeof content === "string") {
      totalChars = checkChars(content, totalChars, `${itemPath}.content`, limits);
      parts.push({ type: "text", text: content });
    } else if (Array.isArray(content)) {
      for (let j = 0; j < content.length; j++) {
        const p = content[j];
        const partPath = `${itemPath}.content[${j}]`;
        if (!isObject(p) || typeof p.type !== "string") {
          throw new TranscriptError(
            "INVALID_INPUT",
            partPath,
            `Invalid content part at ${partPath}`,
          );
        }

        if (p.type === "text") {
          if (typeof p.text !== "string") {
            throw new TranscriptError(
              "INVALID_INPUT",
              `${partPath}.text`,
              `Expected text string at ${partPath}.text`,
            );
          }
          totalChars = checkChars(p.text, totalChars, `${partPath}.text`, limits);
          parts.push({ type: "text", text: p.text });
        } else if (p.type === "image") {
          if (!isObject(p.source) || p.source.type !== "base64") {
            throw new TranscriptError(
              "UNSUPPORTED_PART",
              `${partPath}.source`,
              `Invalid or unsupported image source at ${partPath}`,
            );
          }
          if (typeof p.source.media_type !== "string" || typeof p.source.data !== "string") {
            throw new TranscriptError(
              "INVALID_INPUT",
              `${partPath}.source`,
              `Missing media_type or data at ${partPath}.source`,
            );
          }
          parts.push({
            type: "image",
            mediaType: p.source.media_type,
            data: p.source.data,
          });
        } else {
          throw new TranscriptError(
            "UNSUPPORTED_PART",
            `${partPath}.type`,
            `Unsupported part type '${p.type}'`,
          );
        }
      }
    } else {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.content`,
        `Missing or invalid content at ${itemPath}.content`,
      );
    }

    messages.push({ role, parts });
    if (messages.length > limits.maxMessages) {
      throw new TranscriptError(
        "TOO_MANY_MESSAGES",
        "messages",
        `Exceeded maxMessages limit of ${limits.maxMessages}`,
      );
    }
  }

  const transcript: Transcript = { messages };
  if (system !== undefined) {
    transcript.system = system;
  }
  return transcript;
}

function parseGemini(input: unknown, limits: ResolvedLimits): Transcript {
  if (!isObject(input)) {
    throw new TranscriptError("INVALID_INPUT", "root", "Expected object for Gemini transcript");
  }

  let totalChars = 0;
  let system: string | undefined;

  if ("systemInstruction" in input && input.systemInstruction !== undefined) {
    if (!isObject(input.systemInstruction) || !Array.isArray(input.systemInstruction.parts)) {
      throw new TranscriptError(
        "INVALID_INPUT",
        "systemInstruction",
        "Invalid systemInstruction structure",
      );
    }
    const sysParts: string[] = [];
    for (let i = 0; i < input.systemInstruction.parts.length; i++) {
      const p = input.systemInstruction.parts[i];
      const path = `systemInstruction.parts[${i}]`;
      if (!isObject(p) || typeof p.text !== "string") {
        throw new TranscriptError("INVALID_INPUT", `${path}.text`, `Expected text in ${path}`);
      }
      totalChars = checkChars(p.text, totalChars, `${path}.text`, limits);
      sysParts.push(p.text);
    }
    if (sysParts.length > 0) {
      const joined = sysParts.join("\n\n");
      if (joined.length > 0) {
        system = joined;
      }
    }
  }

  if (!("contents" in input) || !Array.isArray(input.contents)) {
    throw new TranscriptError("INVALID_INPUT", "contents", "Missing or invalid contents array");
  }

  const messages: TranscriptMessage[] = [];

  for (let i = 0; i < input.contents.length; i++) {
    const item = input.contents[i];
    const itemPath = `contents[${i}]`;

    if (!isObject(item)) {
      throw new TranscriptError("INVALID_INPUT", itemPath, `Item at ${itemPath} must be an object`);
    }

    if (!("role" in item) || typeof item.role !== "string") {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.role`,
        `Missing or invalid role at ${itemPath}.role`,
      );
    }

    const role = item.role;
    if (role === "function" || role === "tool") {
      throw new TranscriptError(
        "UNSUPPORTED_ROLE",
        `${itemPath}.role`,
        `Unsupported role '${role}' at ${itemPath}.role`,
      );
    }

    let normalizedRole: "user" | "assistant";
    if (role === "user") {
      normalizedRole = "user";
    } else if (role === "model" || role === "assistant") {
      normalizedRole = "assistant";
    } else {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.role`,
        `Unsupported role '${role}' in Gemini contents`,
      );
    }

    if (!("parts" in item) || !Array.isArray(item.parts)) {
      throw new TranscriptError(
        "INVALID_INPUT",
        `${itemPath}.parts`,
        `Missing or invalid parts at ${itemPath}.parts`,
      );
    }

    const parts: Part[] = [];
    for (let j = 0; j < item.parts.length; j++) {
      const p = item.parts[j];
      const partPath = `${itemPath}.parts[${j}]`;
      if (!isObject(p)) {
        throw new TranscriptError(
          "INVALID_INPUT",
          partPath,
          `Part at ${partPath} must be an object`,
        );
      }

      if ("text" in p && typeof p.text === "string") {
        totalChars = checkChars(p.text, totalChars, `${partPath}.text`, limits);
        parts.push({ type: "text", text: p.text });
      } else if ("inlineData" in p && isObject(p.inlineData)) {
        const inlineData = p.inlineData;
        if (typeof inlineData.mimeType !== "string" || typeof inlineData.data !== "string") {
          throw new TranscriptError(
            "INVALID_INPUT",
            `${partPath}.inlineData`,
            `Missing mimeType or data at ${partPath}.inlineData`,
          );
        }
        parts.push({
          type: "image",
          mediaType: inlineData.mimeType,
          data: inlineData.data,
        });
      } else {
        throw new TranscriptError(
          "UNSUPPORTED_PART",
          partPath,
          `Unsupported Gemini part at ${partPath}`,
        );
      }
    }

    messages.push({ role: normalizedRole, parts });
    if (messages.length > limits.maxMessages) {
      throw new TranscriptError(
        "TOO_MANY_MESSAGES",
        "contents",
        `Exceeded maxMessages limit of ${limits.maxMessages}`,
      );
    }
  }

  const transcript: Transcript = { messages };
  if (system !== undefined) {
    transcript.system = system;
  }
  return transcript;
}

/**
 * Parses provider-specific input into a normalized Transcript.
 */
export function parse(format: Format, input: unknown, opts?: Limits): Transcript {
  const limits = resolveLimits(opts);
  switch (format) {
    case "openai":
      return parseOpenAI(input, limits);
    case "anthropic":
      return parseAnthropic(input, limits);
    case "gemini":
      return parseGemini(input, limits);
    default: {
      const invalidFormat: never = format;
      throw new TranscriptError(
        "INVALID_INPUT",
        "format",
        `Unknown format: ${String(invalidFormat)}`,
      );
    }
  }
}

function renderOpenAI(t: Transcript): unknown[] {
  const result: Array<{
    role: string;
    content:
      | string
      | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  }> = [];

  if (t.system && t.system.length > 0) {
    result.push({
      role: "system",
      content: t.system,
    });
  }

  for (const m of t.messages) {
    if (m.parts.length === 1 && m.parts[0]?.type === "text") {
      result.push({
        role: m.role,
        content: m.parts[0].text,
      });
    } else {
      const content = m.parts.map((p) => {
        if (p.type === "text") {
          return { type: "text" as const, text: p.text };
        }
        return {
          type: "image_url" as const,
          image_url: {
            url: `data:${p.mediaType};base64,${p.data}`,
          },
        };
      });
      result.push({
        role: m.role,
        content,
      });
    }
  }

  return result;
}

function renderAnthropic(t: Transcript): {
  system?: string;
  messages: Array<{
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
        >;
  }>;
} {
  const mergedMessages: Array<{ role: "user" | "assistant"; parts: Part[] }> = [];

  for (const m of t.messages) {
    const last = mergedMessages[mergedMessages.length - 1];
    if (last && last.role === m.role) {
      last.parts = last.parts.concat(m.parts.map((p) => ({ ...p })));
    } else {
      mergedMessages.push({
        role: m.role,
        parts: m.parts.map((p) => ({ ...p })),
      });
    }
  }

  const messages = mergedMessages.map((m) => {
    if (m.parts.length === 1 && m.parts[0]?.type === "text") {
      return {
        role: m.role,
        content: m.parts[0].text,
      };
    }
    return {
      role: m.role,
      content: m.parts.map((p) => {
        if (p.type === "text") {
          return { type: "text" as const, text: p.text };
        }
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: p.mediaType,
            data: p.data,
          },
        };
      }),
    };
  });

  const result: {
    system?: string;
    messages: typeof messages;
  } = { messages };

  if (t.system && t.system.length > 0) {
    result.system = t.system;
  }

  return result;
}

function renderGemini(t: Transcript): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  }>;
} {
  const contents = t.messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: m.parts.map((p) => {
      if (p.type === "text") {
        return { text: p.text };
      }
      return {
        inlineData: {
          mimeType: p.mediaType,
          data: p.data,
        },
      };
    }),
  }));

  const result: {
    systemInstruction?: { parts: Array<{ text: string }> };
    contents: typeof contents;
  } = { contents };

  if (t.system && t.system.length > 0) {
    result.systemInstruction = {
      parts: [{ text: t.system }],
    };
  }

  return result;
}

/**
 * Renders a normalized Transcript into provider-specific format.
 * Never mutates input transcript.
 */
export function render(format: Format, t: Transcript): unknown {
  switch (format) {
    case "openai":
      return renderOpenAI(t);
    case "anthropic":
      return renderAnthropic(t);
    case "gemini":
      return renderGemini(t);
    default: {
      const invalidFormat: never = format;
      throw new TranscriptError(
        "INVALID_INPUT",
        "format",
        `Unknown format: ${String(invalidFormat)}`,
      );
    }
  }
}

/**
 * Converts chat transcript input from one format directly to another.
 */
export function convert(input: unknown, from: Format, to: Format, opts?: Limits): unknown {
  const intermediate = parse(from, input, opts);
  return render(to, intermediate);
}
