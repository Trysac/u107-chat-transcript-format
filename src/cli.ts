import { readFile } from "node:fs/promises";
import { convert, type Format, TranscriptError } from "./index.js";

export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

function isKnownFormat(f: string): f is Format {
  return f === "openai" || f === "anthropic" || f === "gemini";
}

/**
 * CLI entry point runner for transcript conversions.
 *
 * Return codes:
 * - 0: Success
 * - 1: Findings or domain failure
 * - 2: Usage error, file I/O, JSON parse error, or TranscriptError
 */
export async function run(argv: string[], io: CliIO): Promise<number> {
  let fromFormat: string | undefined;
  let toFormat: string | undefined;
  let filePath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") {
      i++;
      fromFormat = argv[i];
    } else if (arg === "--to") {
      i++;
      toFormat = argv[i];
    } else if (arg && !arg.startsWith("-") && filePath === undefined) {
      filePath = arg;
    } else {
      io.stderr(`error: unexpected argument '${arg}'\n`);
      return 2;
    }
  }

  if (!fromFormat || !toFormat || !filePath) {
    io.stderr("error: usage --from <format> --to <format> <file>\n");
    return 2;
  }

  if (!isKnownFormat(fromFormat)) {
    io.stderr(`error: unknown --from format '${fromFormat}'\n`);
    return 2;
  }

  if (!isKnownFormat(toFormat)) {
    io.stderr(`error: unknown --to format '${toFormat}'\n`);
    return 2;
  }

  let rawContent: string;
  try {
    rawContent = await readFile(filePath, "utf8");
  } catch (err) {
    io.stderr(
      `error: cannot read file '${filePath}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (err) {
    io.stderr(
      `error: invalid json in '${filePath}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  try {
    const converted = convert(parsedJson, fromFormat, toFormat);
    io.stdout(`${JSON.stringify(converted, null, 2)}\n`);
    return 0;
  } catch (err) {
    if (err instanceof TranscriptError) {
      io.stderr(`error: ${err.code}\n`);
      return 2;
    }
    io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
}
