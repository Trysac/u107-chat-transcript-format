import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

describe("CLI run() runner", () => {
  it("run(['--from', 'openai', '--to', 'gemini', 'in.json'], io) writes the converted JSON with 2-space indentation and a trailing newline and returns 0; an unknown format returns 2", async () => {
    const filePath = join(
      tmpdir(),
      `test-transcript-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    const testData = [
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hi" },
    ];
    await writeFile(filePath, JSON.stringify(testData), "utf8");

    let out = "";
    let err = "";
    const io = {
      stdout: (s: string) => {
        out += s;
      },
      stderr: (s: string) => {
        err += s;
      },
    };

    try {
      const code = await run(["--from", "openai", "--to", "gemini", filePath], io);
      expect(code).toBe(0);
      expect(out.endsWith("\n")).toBe(true);
      const parsed = JSON.parse(out);
      expect(parsed).toEqual({
        systemInstruction: { parts: [{ text: "Be brief." }] },
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      });
      expect(out).toBe(`${JSON.stringify(parsed, null, 2)}\n`);

      let unknownErr = "";
      const unknownCode = await run(["--from", "bad_format", "--to", "gemini", filePath], {
        stdout: () => {},
        stderr: (s) => {
          unknownErr += s;
        },
      });
      expect(unknownCode).toBe(2);
      expect(unknownErr).toContain("unknown --from format");
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });

  it("returns 2 on usage errors or missing arguments", async () => {
    let err = "";
    const io = {
      stdout: () => {},
      stderr: (s: string) => {
        err += s;
      },
    };
    const code = await run(["--from", "openai"], io);
    expect(code).toBe(2);
    expect(err).toContain("error: usage");
  });

  it("returns 2 on unknown destination format", async () => {
    let err = "";
    const io = {
      stdout: () => {},
      stderr: (s: string) => {
        err += s;
      },
    };
    const code = await run(["--from", "openai", "--to", "bad_to", "dummy.json"], io);
    expect(code).toBe(2);
    expect(err).toContain("unknown --to format");
  });

  it("returns 2 on unexpected argument", async () => {
    let err = "";
    const io = {
      stdout: () => {},
      stderr: (s: string) => {
        err += s;
      },
    };
    const code = await run(["--from", "openai", "--to", "gemini", "file1.json", "extra"], io);
    expect(code).toBe(2);
    expect(err).toContain("unexpected argument");
  });

  it("returns 2 when file cannot be read", async () => {
    let err = "";
    const io = {
      stdout: () => {},
      stderr: (s: string) => {
        err += s;
      },
    };
    const code = await run(
      ["--from", "openai", "--to", "gemini", "non-existent-path-abc123.json"],
      io,
    );
    expect(code).toBe(2);
    expect(err).toContain("cannot read file");
  });

  it("returns 2 on JSON parse errors in file", async () => {
    const filePath = join(tmpdir(), `invalid-json-${Date.now()}.json`);
    await writeFile(filePath, "not json content", "utf8");

    let err = "";
    const io = {
      stdout: () => {},
      stderr: (s: string) => {
        err += s;
      },
    };

    try {
      const code = await run(["--from", "openai", "--to", "gemini", filePath], io);
      expect(code).toBe(2);
      expect(err).toContain("invalid json in");
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });

  it("returns 2 with error: <code> on TranscriptError", async () => {
    const filePath = join(tmpdir(), `transcript-err-${Date.now()}.json`);
    const invalidData = [{ role: "tool", content: "unsupported role" }];
    await writeFile(filePath, JSON.stringify(invalidData), "utf8");

    let err = "";
    const io = {
      stdout: () => {},
      stderr: (s: string) => {
        err += s;
      },
    };

    try {
      const code = await run(["--from", "openai", "--to", "gemini", filePath], io);
      expect(code).toBe(2);
      expect(err).toBe("error: UNSUPPORTED_ROLE\n");
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });
});
