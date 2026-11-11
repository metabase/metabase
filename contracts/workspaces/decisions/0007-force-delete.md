# 0007. `?force=true` on DELETE only for `teardown_failed`

- Status: accepted
- Date: 2026-11-10

## Context

A workspace whose teardown failed can't be deleted normally. An admin needs a way out that doesn't skip a normal teardown.

## Decision

`DELETE /{id}?force=true` is accepted only for a workspace in `teardown_failed`. Removing a stuck workspace is two steps: a normal DELETE, which fails and marks it `teardown_failed`, then a forced DELETE.

## Alternatives rejected

- Let force skip teardown for a workspace in any state: a caller could skip teardown and leave warehouse objects behind.

## Consequences

Force removes the row and may leave warehouse objects; the admin owns that cleanup.

## Resources

- https://github.com/metabase/metabase/pull/86788
