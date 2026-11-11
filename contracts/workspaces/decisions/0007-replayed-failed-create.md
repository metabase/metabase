# 0007. A replayed failed create returns 500 with the workspace id

- Status: accepted
- Implemented: in review (#86825, with #86601)
- Date: 2026-11-10

## Context

`POST` create takes an `Idempotency-Key`. If the first attempt failed and left a workspace behind, the caller needs its id to clean up.

## Decision

Replaying the key for a failed create returns 500 with `workspace_id` and `cleanup_required`, also when the kept workspace has no databases.

## Alternatives rejected

- Clear the key when a create fails, so a retry starts fresh: the caller never learns the id of the leftover workspace.

## Consequences

A retry loop sees the same 500 every time and must clean up, not retry.

## Resources

- https://github.com/metabase/metabase/pull/86825
- https://github.com/metabase/metabase/pull/86601
- https://linear.app/metabase/issue/ENG-14516
