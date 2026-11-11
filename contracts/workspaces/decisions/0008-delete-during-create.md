# 0008. DELETE during a create returns 409 `workspace_busy`

- Status: proposed
- Lands with: #86789 (after #86601)
- Date: 2026-11-11

## Context

A DELETE that arrives while a create is still running could destroy a workspace database whose init never ran. A probe reproduced it 10/10 on #86601 alone.

## Decision

DELETE during a create returns 409 `workspace_busy` and destroys nothing. A regression test lands in #86789 after #86601 merges, because it needs #86601's `:workspace/cleanup? false` handling.

## Alternatives rejected

- None recorded.

## Consequences

Callers retry DELETE after the create finishes. A related crash case is still open (ENG-14520).

## Resources

- https://github.com/metabase/metabase/pull/86789
- https://github.com/metabase/metabase/pull/86601
- https://linear.app/metabase/issue/ENG-14520
