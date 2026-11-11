# 0006. The SSH tunnel credential ships to the sidecar

- Status: proposed
- Lands with: #86584
- Date: 2026-11-10

## Context

The config sent to the sidecar drops the parent's own credentials. A database reached through an SSH tunnel needs the tunnel credential to connect at all.

## Decision

When a database uses an SSH tunnel, the config includes the tunnel credential, named as a parent secret.

## Alternatives rejected

- Refuse tunneled databases with a 409: tunneled databases can't be used in a workspace.
- Build a per-workspace tunnel identity: deferred to a later PR.

## Consequences

The sidecar holds a parent secret for tunneled databases. MB Code keeps the config in the OS keychain and redacts it from agent-visible output.

## Resources

- https://github.com/metabase/metabase/pull/86584
