# 0012. A staging warehouse is an ordinary Database, owned by the customer

- Status: proposed
- Implemented: not started
- Date: 2026-11-10

## Context

Some customers forbid agent writes in the production warehouse at all and want transforms to run against a separate staging warehouse. Keeping staging in sync with production (copy, refresh, PII masking) is a replication product.

## Decision

A staging warehouse is an ordinary Database on the parent, paired one to one with the production Database it stands in for, through a database setting. The same API and sidecar serve it. Staging must use production's database and schema names. Metabase does not create, copy, refresh or mask staging data.

## Alternatives rejected

- Metabase clones production into staging: that is a separate replication product.
- Per-developer staging logins (as rde-harness does): secrets on laptops, no revocation.
- A separate staging API: two code paths for one idea.
- A schema-name map: name rewriting is the most fragile part of rde-harness.

## Consequences

Not built. Open: whether git-sync content keyed by database name imports into a sidecar pointed at a renamed staging database, and who may pair a staging database.

## Resources

- https://linear.app/metabase/document/e5f3411c13f6
