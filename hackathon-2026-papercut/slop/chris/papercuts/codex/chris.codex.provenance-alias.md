# Provider provenance used different identities at two boundaries

Source: Codex session 2026-09-16, [transcript](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T18-43-10-01a0ac63-6602-7cf0-94da-3480c08d5ba4.jsonl).

Observed failure: a review of evals provider changes found a run record using the Metabot route while the publication manifest still used an OpenCode alias. For aliased Vertex or Moonshot results, the mismatch could cause otherwise completed runs to be discarded at publication ([line 6457](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T18-43-10-01a0ac63-6602-7cf0-94da-3480c08d5ba4.jsonl#L6457)).

Mechanism: provider identity is translated at multiple surfaces. The first implementation fixed one surface but left another representation stale. The names appeared related enough that the missing boundary was easy to overlook.

Recorded repair: the agent corrected the publication boundary, added an assertion, and later reported 153 focused tests passing before push ([line 6545](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T18-43-10-01a0ac63-6602-7cf0-94da-3480c08d5ba4.jsonl#L6545)).

Classification: review-detected near miss rather than a confirmed production loss; inconsistent identity mapping caused rework and could have silently dropped results.
