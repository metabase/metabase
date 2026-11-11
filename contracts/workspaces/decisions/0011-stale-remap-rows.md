# 0011. Don't act on remap rows that point at an old namespace

- Status: accepted
- Date: 2026-11-10

## Context

When a transform's target is dropped, a remap row could point at a namespace the workspace no longer uses.

## Decision

Such a row is not used to drop anything. The stale-remap change was closed.

## Alternatives rejected

- Also drop the table a stale row points at: namespaces can't change, and #86735 deletes remap rows when the workspace schema changes, so the case doesn't arise.

## Consequences

If namespaces ever become changeable, revisit.

## Resources

- https://github.com/metabase/metabase/pull/86609
- https://github.com/metabase/metabase/pull/86735
