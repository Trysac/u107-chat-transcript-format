# Use Canonical Pivot Representation for Multi-Provider Chat Transcripts

Status: accepted (generated, pending human review)

## Context

Converting chat transcripts between OpenAI, Anthropic, and Gemini requires handling discrepancies in system prompts, message alternation, and multimodal image representations without silent data loss.

## Decision

Adopt a normalized intermediate `Transcript` structure with explicit `text` and base64 `image` parts. Isolate format-specific normalization during parsing and provider canonicalization during rendering. Forbid remote image downloads and raise typed `TranscriptError` for unsupported elements.

## Consequences

Preserves ordering and semantic fidelity between providers. Enables deterministic round-trips for supported structures while immediately halting on lossy or unsafe elements.
