# @trysac/chat-transcript-format

![CI](https://github.com/trysac/chat-transcript-format/workflows/ci/badge.svg)

Moving a conversation between providers means rewriting roles, system prompts and content parts by hand, and silent mistakes such as dropped images or merged turns change model behaviour. This library provides a neutral, dependency-free, and strict converter between OpenAI, Anthropic, and Gemini chat transcript formats.

## Installation

```bash
npm install @trysac/chat-transcript-format
```

## Usage

```typescript
import { convert } from "@trysac/chat-transcript-format";

const input = [{ role: "user", content: "Hi" }];
try {
  const gemini = convert(input, "openai", "gemini");
  console.log(gemini);
} catch (err) {
  console.error("Conversion failed:", err);
}
```

## Public API

- `parse(format, input, opts?)`: Parses provider-specific input into a normalized `Transcript` object.
- `render(format, transcript)`: Renders a `Transcript` into a provider-specific format.
- `convert(input, from, to, opts?)`: Directly converts input from one format to another.
- `TranscriptError`: Thrown for `INVALID_INPUT`, `UNSUPPORTED_ROLE`, `UNSUPPORTED_PART`, `TOO_MANY_MESSAGES`, or `TOO_LARGE`.
- `Limits`: Options `{ maxMessages: number, maxChars: number }` to enforce bounds.

## Why not provider SDKs?

Provider-specific SDKs are tied to their own ecosystems. This utility is provider-agnostic, zero-dependency, and strictly validates input at every step to prevent silent data loss or format mismatches.

See [docs/SECURITY.md](docs/SECURITY.md) for safety details.