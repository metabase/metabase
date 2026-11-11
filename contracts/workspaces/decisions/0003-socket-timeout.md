# 0003. Keep the 60 s socket timeout on other-database connections

- Status: accepted
- Implemented: on master (#86587)
- Date: 2026-11-10

## Context

Provisioning on Postgres connects to other databases on the server. A hung statement there would hold provisioning forever.

## Decision

Those connections keep a 60 s `socketTimeout`, which bounds every statement.

## Alternatives rejected

- Raise the socket timeout to 300 s.
- Keep only the 10 s connect timeout: a hung statement after connect would still hang provisioning.

## Consequences

A legitimately slow statement on a large server fails after 60 s; revisit if that shows up.

## Resources

- https://github.com/metabase/metabase/pull/86587
