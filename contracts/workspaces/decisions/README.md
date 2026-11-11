# Workspaces decisions

One file per decision: why the Workspaces API and provisioning work the way they do. Format after Nygard (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) and MADR (https://github.com/adr/madr).

Entries 0001-0011 were written after the fact on 2026-11-11 from the PRs, Slack threads and decision forms they link. Those sources are the authority on detail.

## Rules

- **Status binds.** `accepted` is how the code must behave. `proposed` is context only. `superseded by NNNN` is history: don't apply it.
- **Never edit an accepted decision's ruling. Supersede it.** Add a new file, mark the old one `superseded by NNNN (date)`, and have the new one say `Supersedes: NNNN`.
- **Same PR.** A change that makes or alters a decision adds or supersedes its file in that PR.
- **Record what was rejected,** so nobody (person or agent) re-proposes it.
- **Template:** Context, Decision, Alternatives rejected, Consequences, Resources.

## How to add a decision

1. Copy the template below into `NNNN-short-slug.md`, using the next free number.
2. Fill it in. Keep it to a page. Write the Context so a reader who wasn't there understands the constraint.
3. Add a row to the Index.
4. Put the file in the same PR as the code that makes the decision. Start it as `proposed` while it's under discussion; flip it to `accepted` when the PR is approved.
5. To change a decision, add a new file with `- Supersedes: NNNN`, and change the old file's status to `superseded by NNNN (date)`. Leave the rest of the old file as it was.

Agents drafting a record: set status `proposed`, and check that every Resources link exists. A person accepts it.

```markdown
# NNNN. <the decision, stated as the outcome>

- Status: proposed | accepted | superseded by NNNN (YYYY-MM-DD)
- Date: YYYY-MM-DD
- Supersedes: NNNN (only if it does)

## Context

What forced the decision: the problem and the constraints.

## Decision

What we chose, in a few sentences.

## Alternatives rejected

- <option>: why it lost.

## Consequences

What this makes easier or harder, including the bad parts.

## Resources

- <PR, issue, Slack thread or doc where it was decided>
```

## Index

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-build-on-restored-backend.md) | Build on the backend restored on master, not the earlier design | accepted | 2026-11-09 |
| [0002](0002-staging-warehouses.md) | A staging warehouse is an ordinary Database, owned by the customer | proposed | 2026-11-10 |
| [0003](0003-refuse-default-open-warehouses.md) | Refuse warehouses that are open by default | accepted | 2026-11-10 |
| [0004](0004-socket-timeout.md) | Keep the 60 s socket timeout on other-database connections | accepted | 2026-11-10 |
| [0005](0005-config-status-codes.md) | 422 when an admin must fix something; 409 only for "not provisioned" | accepted | 2026-11-10 |
| [0006](0006-ssh-tunnel-credential.md) | The SSH tunnel credential ships to the sidecar | accepted | 2026-11-10 |
| [0007](0007-force-delete.md) | `?force=true` on DELETE only for `teardown_failed` | accepted | 2026-11-10 |
| [0008](0008-replayed-failed-create.md) | A replayed failed create returns 500 with the workspace id | accepted | 2026-11-10 |
| [0009](0009-delete-during-create.md) | DELETE during a create returns 409 `workspace_busy` | accepted | 2026-11-11 |
| [0010](0010-refuse-undo-redo.md) | Refuse undo and redo in workspace mode | accepted | 2026-11-10 |
| [0011](0011-stale-remap-rows.md) | Don't act on remap rows that point at an old namespace | accepted | 2026-11-10 |
