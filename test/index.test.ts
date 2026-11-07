import { describe, expect, it } from "vitest";
import {
  convert,
  type Format,
  type Limits,
  parse,
  render,
  type Transcript,
  TranscriptError,
} from "../src/index.js";

describe("Transcript conversion acceptance tests", () => {
  it("convert([{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }], 'openai', 'gemini') deep-equals { systemInstruction: { parts: [{ text: 'Be brief.' }] }, contents: [{ role: 'user', parts: [{ text: 'Hi' }] }, { role: 'model', parts: [{ text: 'Hello' }] }] }", () => {
    const openaiInput = [
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ];
    const expectedGemini = {
      systemInstruction: { parts: [{ text: "Be brief." }] },
      contents: [
        { role: "user", parts: [{ text: "Hi" }] },
        { role: "model", parts: [{ text: "Hello" }] },
      ],
    };
    const result = convert(openaiInput, "openai", "gemini");
    expect(result).toEqual(expectedGemini);
  });

  it("For every text-only fixture x in canonical form, convert(convert(x, 'anthropic', 'openai'), 'openai', 'anthropic') deep-equals x, and the same holds through 'gemini'", () => {
    const fixtures: unknown[] = [
      {
        system: "You are a helpful assistant.",
        messages: [
          { role: "user", content: "Hello world" },
          { role: "assistant", content: "Hello there!" },
        ],
      },
      {
        messages: [
          { role: "user", content: "First user turn" },
          { role: "assistant", content: "Assistant reply" },
          { role: "user", content: "Second user turn" },
        ],
      },
      {
        system: "Only system prompt here",
        messages: [],
      },
    ];

    for (const fixture of fixtures) {
      const anthropicToOpenAIToAnthropic = convert(
        convert(fixture, "anthropic", "openai"),
        "openai",
        "anthropic",
      );
      expect(anthropicToOpenAIToAnthropic).toEqual(fixture);

      const anthropicToGeminiToAnthropic = convert(
        convert(fixture, "anthropic", "gemini"),
        "gemini",
        "anthropic",
      );
      expect(anthropicToGeminiToAnthropic).toEqual(fixture);
    }
  });

  it("render('anthropic', t) for two consecutive user messages 'a' and 'b' returns one user message with content [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]", () => {
    const transcript: Transcript = {
      messages: [
        { role: "user", parts: [{ type: "text", text: "a" }] },
        { role: "user", parts: [{ type: "text", text: "b" }] },
      ],
    };
    const rendered = render("anthropic", transcript);
    expect(rendered).toEqual({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        },
      ],
    });
  });

  it("An OpenAI part { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBO' } } becomes the Anthropic part { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBO' } } and the Gemini part { inlineData: { mimeType: 'image/png', data: 'iVBO' } }", () => {
    const openai = [
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: "data:image/png;base64,iVBO" } }],
      },
    ];

    const anthropicExpected = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "iVBO",
              },
            },
          ],
        },
      ],
    };

    const geminiExpected = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: "iVBO",
              },
            },
          ],
        },
      ],
    };

    expect(convert(openai, "openai", "anthropic")).toEqual(anthropicExpected);
    expect(convert(openai, "openai", "gemini")).toEqual(geminiExpected);
  });

  it("An image_url of 'https://x.test/y.png' throws TranscriptError with code 'UNSUPPORTED_PART', an OpenAI role 'tool' or a Gemini role 'function' throws code 'UNSUPPORTED_ROLE', and a message without role throws code 'INVALID_INPUT' with path 'messages[1].role'", () => {
    const remoteImage = [
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: "https://x.test/y.png" } }],
      },
    ];
    expect(() => parse("openai", remoteImage)).toThrowError(TranscriptError);
    try {
      parse("openai", remoteImage);
    } catch (e) {
      const err = e as TranscriptError;
      expect(err.code).toBe("UNSUPPORTED_PART");
    }

    const toolOpenAI = [{ role: "tool", content: "result" }];
    expect(() => parse("openai", toolOpenAI)).toThrowError(TranscriptError);
    try {
      parse("openai", toolOpenAI);
    } catch (e) {
      const err = e as TranscriptError;
      expect(err.code).toBe("UNSUPPORTED_ROLE");
    }

    const funcGemini = { contents: [{ role: "function", parts: [{ text: "test" }] }] };
    expect(() => parse("gemini", funcGemini)).toThrowError(TranscriptError);
    try {
      parse("gemini", funcGemini);
    } catch (e) {
      const err = e as TranscriptError;
      expect(err.code).toBe("UNSUPPORTED_ROLE");
    }

    const missingRole = {
      messages: [{ role: "user", content: "hello" }, { content: "no role" }],
    };
    expect(() => parse("anthropic", missingRole)).toThrowError(TranscriptError);
    try {
      parse("anthropic", missingRole);
    } catch (e) {
      const err = e as TranscriptError;
      expect(err.code).toBe("INVALID_INPUT");
      expect(err.path).toBe("messages[1].role");
    }
  });

  it("Two OpenAI system messages 'A' and 'B' render to the Anthropic system 'A\n\nB', and the role 'developer' is treated as system", () => {
    const input = [
      { role: "system", content: "A" },
      { role: "developer", content: "B" },
      { role: "user", content: "question" },
    ];
    const anthropicResult = convert(input, "openai", "anthropic") as { system?: string };
    expect(anthropicResult.system).toBe("A\n\nB");
  });

  it("An input with 10_001 messages throws code 'TOO_MANY_MESSAGES' and a text part of 1_000_001 UTF-16 units throws code 'TOO_LARGE'", () => {
    const messages = Array.from({ length: 10_001 }, () => ({ role: "user", content: "hi" }));
    expect(() => parse("openai", messages)).toThrowError(TranscriptError);
    try {
      parse("openai", messages);
    } catch (e) {
      const err = e as TranscriptError;
      expect(err.code).toBe("TOO_MANY_MESSAGES");
    }

    const longText = "a".repeat(1_000_001);
    const largeMessage = [{ role: "user", content: longText }];
    expect(() => parse("openai", largeMessage)).toThrowError(TranscriptError);
    try {
      parse("openai", largeMessage);
    } catch (e) {
      const err = e as TranscriptError;
      expect(err.code).toBe("TOO_LARGE");
    }
  });
});

describe("Edge cases and error paths", () => {
  it("supports empty messages array and system-only transcripts", () => {
    const emptyAnthropic = { messages: [] };
    const parsedEmpty = parse("anthropic", emptyAnthropic);
    expect(parsedEmpty.messages).toEqual([]);
    expect(render("openai", parsedEmpty)).toEqual([]);

    const systemOnly = [{ role: "system", content: "System prompt only" }];
    const parsedSys = parse("openai", systemOnly);
    expect(parsedSys.system).toBe("System prompt only");
    expect(parsedSys.messages).toEqual([]);
    expect(render("gemini", parsedSys)).toEqual({
      systemInstruction: { parts: [{ text: "System prompt only" }] },
      contents: [],
    });
  });

  it("supports assistant-first transcripts", () => {
    const input = [
      { role: "assistant", content: "How can I help you today?" },
      { role: "user", content: "Tell me a joke." },
    ];
    const transcript = parse("openai", input);
    expect(transcript.messages[0]?.role).toBe("assistant");
    const gemini = render("gemini", transcript) as { contents: Array<{ role: string }> };
    expect(gemini.contents[0]?.role).toBe("model");
  });

  it("handles unicode text properly", () => {
    const unicodeText = "こんにちは世界 🚀 𠮷野家";
    const input = [{ role: "user", content: unicodeText }];
    const converted = convert(input, "openai", "gemini") as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(converted.contents[0]?.parts[0]?.text).toBe(unicodeText);
  });

  it("supports image-only messages and mixed text/image parts order preserved", () => {
    const mixed = [
      {
        role: "user",
        content: [
          { type: "text", text: "First text" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,1234" } },
          { type: "text", text: "Second text" },
        ],
      },
    ];
    const transcript = parse("openai", mixed);
    expect(transcript.messages[0]?.parts).toEqual([
      { type: "text", text: "First text" },
      { type: "image", mediaType: "image/jpeg", data: "1234" },
      { type: "text", text: "Second text" },
    ]);

    const gemini = render("gemini", transcript) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    expect(gemini.contents[0]?.parts).toEqual([
      { text: "First text" },
      { inlineData: { mimeType: "image/jpeg", data: "1234" } },
      { text: "Second text" },
    ]);
  });

  it("rejects non-array root for openai", () => {
    expect(() => parse("openai", {})).toThrowError(TranscriptError);
  });

  it("rejects non-object root for anthropic and gemini", () => {
    expect(() => parse("anthropic", "invalid")).toThrowError(TranscriptError);
    expect(() => parse("gemini", null)).toThrowError(TranscriptError);
  });

  it("validates Anthropic structure errors", () => {
    expect(() => parse("anthropic", { system: 123, messages: [] })).toThrowError(TranscriptError);
    expect(() => parse("anthropic", { messages: "not an array" })).toThrowError(TranscriptError);
    expect(() => parse("anthropic", { messages: ["not-an-object"] })).toThrowError(TranscriptError);
    expect(() => parse("anthropic", { messages: [{ role: "tool", content: "x" }] })).toThrowError(
      TranscriptError,
    );
    expect(() =>
      parse("anthropic", { messages: [{ role: "invalid_role", content: "x" }] }),
    ).toThrowError(TranscriptError);
    expect(() => parse("anthropic", { messages: [{ role: "user", content: 123 }] })).toThrowError(
      TranscriptError,
    );
    expect(() =>
      parse("anthropic", { messages: [{ role: "user", content: [null] }] }),
    ).toThrowError(TranscriptError);
    expect(() =>
      parse("anthropic", { messages: [{ role: "user", content: [{ type: "text", text: 123 }] }] }),
    ).toThrowError(TranscriptError);
    expect(() =>
      parse("anthropic", {
        messages: [{ role: "user", content: [{ type: "image", source: { type: "url" } }] }],
      }),
    ).toThrowError(TranscriptError);
    expect(() =>
      parse("anthropic", {
        messages: [
          {
            role: "user",
            content: [{ type: "image", source: { type: "base64", media_type: 123, data: "xyz" } }],
          },
        ],
      }),
    ).toThrowError(TranscriptError);
    expect(() =>
      parse("anthropic", { messages: [{ role: "user", content: [{ type: "unsupported" }] }] }),
    ).toThrowError(TranscriptError);
  });

  it("validates Gemini structure errors", () => {
    expect(() => parse("gemini", { systemInstruction: "invalid", contents: [] })).toThrowError(
      TranscriptError,
    );
    expect(() =>
      parse("gemini", { systemInstruction: { parts: [{ text: 123 }] }, contents: [] }),
    ).toThrowError(TranscriptError);
    expect(() => parse("gemini", { contents: "invalid" })).toThrowError(TranscriptError);
    expect(() => parse("gemini", { contents: ["invalid-item"] })).toThrowError(TranscriptError);
    expect(() => parse("gemini", { contents: [{ role: 123 }] })).toThrowError(TranscriptError);
    expect(() => parse("gemini", { contents: [{ role: "unknown", parts: [] }] })).toThrowError(
      TranscriptError,
    );
    expect(() =>
      parse("gemini", { contents: [{ role: "user", parts: "not-an-array" }] }),
    ).toThrowError(TranscriptError);
    expect(() => parse("gemini", { contents: [{ role: "user", parts: [null] }] })).toThrowError(
      TranscriptError,
    );
    expect(() =>
      parse("gemini", {
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: 123, data: "ok" } }] }],
      }),
    ).toThrowError(TranscriptError);
    expect(() =>
      parse("gemini", { contents: [{ role: "user", parts: [{ unknownType: true }] }] }),
    ).toThrowError(TranscriptError);
  });

  it("validates OpenAI parts errors", () => {
    expect(() => parse("openai", [{ notRole: "user" }])).toThrowError(TranscriptError);
    expect(() => parse("openai", [{ role: "unsupported_role", content: "ok" }])).toThrowError(
      TranscriptError,
    );
    expect(() => parse("openai", [{ role: "user", content: 123 }])).toThrowError(TranscriptError);
    expect(() => parse("openai", [{ role: "user", content: [null] }])).toThrowError(
      TranscriptError,
    );
    expect(() =>
      parse("openai", [{ role: "user", content: [{ type: "text", text: 123 }] }]),
    ).toThrowError(TranscriptError);
    expect(() =>
      parse("openai", [
        { role: "user", content: [{ type: "image_url", image_url: { url: 123 } }] },
      ]),
    ).toThrowError(TranscriptError);
    expect(() => parse("openai", [{ role: "user", content: [{ type: "unknown" }] }])).toThrowError(
      TranscriptError,
    );
    expect(() =>
      parse("openai", [
        {
          role: "system",
          content: [{ type: "image_url", image_url: { url: "data:image/png;base64,abc" } }],
        },
      ]),
    ).toThrowError(TranscriptError);
  });

  it("supports custom limits", () => {
    const limits: Limits = { maxMessages: 1, maxChars: 10 };
    expect(() =>
      parse("openai", [{ role: "user", content: "0123456789extra" }], limits),
    ).toThrowError(TranscriptError);
    expect(() =>
      parse(
        "openai",
        [
          { role: "user", content: "short" },
          { role: "assistant", content: "extra message" },
        ],
        limits,
      ),
    ).toThrowError(TranscriptError);
  });

  it("render handles unsupported format dynamically", () => {
    expect(() => render("unknown" as Format, { messages: [] })).toThrowError(TranscriptError);
    expect(() => parse("unknown" as Format, [])).toThrowError(TranscriptError);
  });

  it("render never mutates input transcript", () => {
    const original: Transcript = {
      system: "Be good",
      messages: [
        { role: "user", parts: [{ type: "text", text: "A" }] },
        { role: "user", parts: [{ type: "text", text: "B" }] },
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(original));
    render("anthropic", original);
    render("openai", original);
    render("gemini", original);
    expect(original).toEqual(snapshot);
  });
});
