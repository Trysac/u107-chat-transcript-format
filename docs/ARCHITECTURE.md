# Architecture

## Overview

`@trysac/chat-transcript-format` acts as a translation layer between provider-specific JSON structures and a unified internal `Transcript` model.

## Modules

- `src/index.ts`: Public API. Contains the `Transcript` type definitions, `TranscriptError` class, and the logic for parsing and rendering.
- `src/cli.ts`: The runner module. Handles file system IO via `node:fs/promises`, reads input files, and passes them to the library core.

## Data Flow

1. `parse(format, input)`: Normalizes provider-specific structures into the internal `Transcript` object. It validates roles (e.g., rejecting `tool` or `function` roles) and enforces character/message limits.
2. `render(format, transcript)`: Transforms the internal `Transcript` object back into the target provider's schema.
3. `convert(input, from, to)`: Combines parsing and rendering.

## Immutability

Renderers and parsers are side-effect free. They never mutate input structures and return new object references.