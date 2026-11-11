# 0011. A live workspace can widen and narrow its input schemas

- Status: accepted
- Implemented: not started (ENG-14550, after the hardening PRs merge)
- Date: 2026-11-11

## Context

A workspace's input schemas are fixed when it is created. An agent that needs a schema created later, or a person who wants to narrow what it reads, has to delete the workspace and create a new one, losing its scratch tables and remap rows. Decision 0001 put live schema changes in the backlog until the hardening PRs landed.

## Decision

The parent gets an endpoint that adds or removes input schemas on a live workspace (`POST /api/ee/workspace-manager/{id}/schemas`, contract op `changeWorkspaceSchemas`). It grants or revokes read access for the workspace login and updates the workspace's `input_schemas`. mbcode then widens or narrows the sidecar's schema filter with `PUT /api/database/{id}` and syncs; no sidecar restart. Only read access changes: each database keeps its one scratch schema, so outputs and remap rows are untouched.

## Alternatives rejected

- Delete and recreate the workspace: loses scratch tables and remap rows, and costs a full provisioning.
- Refetch `/config` and restart the sidecar (the contract's first proposal): the sidecar's sync filter is already the input-schema list, and #86735 makes workspace mode settings, so an API call does it without a restart.

## Consequences

Needs a `revoke-workspace-read-access!` driver multimethod for every engine that implements `grant-workspace-read-access!`, and a refusal while a database row is provisioning (the #86789 busy rule). The selvage "Widen a live workspace" flow becomes checkable once the operation is in the spec.

## Resources

- https://linear.app/metabase/issue/ENG-14550
- https://mb-shares.escherize.workers.dev/workspaces-86735-setup-flow-c4fc94/
- Decision 0001 (live schema changes deferred to backlog)
