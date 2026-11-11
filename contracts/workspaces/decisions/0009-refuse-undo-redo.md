# 0009. Refuse undo and redo in workspace mode

- Status: accepted
- Implemented: in review (#86603)
- Date: 2026-11-10

## Context

#86603 refuses actions and data-grid edits on a workspace instance, because those writes go to production tables; only transform output is redirected.

## Decision

The same gate refuses `data-editing/undo` and `redo`.

## Alternatives rejected

- Allow them: undo of a refused edit has nothing to undo today, but it would be one more write path to production.

## Consequences

A future feature that lets the agent edit workspace-side tables in the grid must revisit this.

## Resources

- https://github.com/metabase/metabase/pull/86603
