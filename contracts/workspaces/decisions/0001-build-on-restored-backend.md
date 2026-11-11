# 0001. Build on the backend restored on master, not the earlier design

- Status: accepted
- Implemented: on master (#86563)
- Date: 2026-11-09

## Context

An earlier design doc described features master doesn't have: per-schema scratch, live add/remove of schemas, `GET /:id/connection`, provisioning-connection endpoints and encrypted credentials. #86563 restored the Workspaces backend on master, and a stack of hardening PRs builds on it.

## Decision

We build on the restored backend and the hardening PRs. The earlier design doc is deprecated. Its extra features go to Backlog, to be decided after the hardening PRs land. The API contract (Linear doc and #86714) describes what exists.

## Alternatives rejected

- None recorded: the earlier design was deprecated once #86563 restored the backend.

## Consequences

Readers must use the contract doc, not the deprecated design. Each Backlog feature needs its own decision later.

## Resources

- https://github.com/metabase/metabase/pull/86563
- https://github.com/metabase/metabase/pull/86714
- https://linear.app/metabase/document/workspaces-api-contract-018c0d7bc9ca
- https://linear.app/metabase/issue/ENG-14484
