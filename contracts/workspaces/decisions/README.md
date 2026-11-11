# Workspaces decisions

One file per decision: why the Workspaces API and provisioning work the way they do. Format after Nygard (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) and MADR (https://github.com/adr/madr).

Entries 0001-0010 and 0012 were written after the fact on 2026-11-11 from the PRs, Slack threads and decision forms they link. Those sources are the authority on detail.

## Rules

- **Two fields, two questions.** `Status` is about the decision: `proposed` (under discussion), `accepted` (decided), `superseded by NNNN` (replaced). `Implemented` is about the code: `on master (#PR)`, `in review (#PR)` or `not started`.
- **What binds.** `accepted` + `on master`: master does this, and changes must keep it so. `accepted` + `in review`: the target for that PR, not yet true of master. `proposed`: context only. `superseded`: history, don't apply it.
- **Never edit an accepted decision's ruling. Supersede it.** Add a new file, mark the old one `superseded by NNNN (date)`, and have the new one say `Supersedes: NNNN`.
- **Same PR.** A change that makes or alters a decision adds or supersedes its file in that PR.
- **Record what was rejected,** so nobody (person or agent) re-proposes it.
- **Template:** Context, Decision, Alternatives rejected, Consequences, Resources.

## How to add a decision

1. Copy the template below into `NNNN-short-slug.md`, using the next free number.
2. Fill it in. Keep it to a page. Write the Context so a reader who wasn't there understands the constraint.
3. Add a row to the Index.
4. Put the file in the same PR as the code that implements it, with `- Implemented: in review (#PR)`. Set `Status` to `accepted` once the decision is agreed (that can be before the code merges). Flip `Implemented` to `on master (#PR)` when the PR merges.
5. To change a decision, add a new file with `- Supersedes: NNNN`, and change the old file's status to `superseded by NNNN (date)`. Leave the rest of the old file as it was.

Agents drafting a record: set status `proposed`, and check that every Resources link exists. A person accepts it.

```markdown
# NNNN. <the decision, stated as the outcome>

- Status: proposed | accepted | superseded by NNNN (YYYY-MM-DD)
- Date: YYYY-MM-DD
- Implemented: on master (#PR) | in review (#PR) | not started
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

| # | Decision | Status | Implemented | Date |
|---|---|---|---|---|
| [0001](0001-build-on-restored-backend.md) | Build on the backend restored on master, not the earlier design | accepted | on master (#86563) | 2026-11-09 |
| [0002](0002-refuse-default-open-warehouses.md) | Refuse warehouses that are open by default | accepted | in review (#86588, #86798, #86799) | 2026-11-10 |
| [0003](0003-socket-timeout.md) | Keep the 60 s socket timeout on other-database connections | accepted | on master (#86587) | 2026-11-10 |
| [0004](0004-config-status-codes.md) | 422 when an admin must fix something; 409 only for "not provisioned" | accepted | in review (#86584 incl. #86585, #86787) | 2026-11-10 |
| [0005](0005-ssh-tunnel-credential.md) | The SSH tunnel credential ships to the sidecar | accepted | in review (#86584) | 2026-11-10 |
| [0006](0006-force-delete.md) | `?force=true` on DELETE only for `teardown_failed` | accepted | in review (#86788) | 2026-11-10 |
| [0007](0007-replayed-failed-create.md) | A replayed failed create returns 500 with the workspace id | accepted | in review (#86825, with #86601) | 2026-11-10 |
| [0008](0008-delete-during-create.md) | DELETE during a create returns 409 `workspace_busy` | accepted | in review (#86789, after #86601) | 2026-11-11 |
| [0009](0009-refuse-undo-redo.md) | Refuse undo and redo in workspace mode | accepted | in review (#86603) | 2026-11-10 |
| [0010](0010-stale-remap-rows.md) | Don't act on remap rows that point at an old namespace | accepted | in review (#86609) | 2026-11-10 |
| [0011](0011-widen-narrow-input-schemas.md) | A live workspace can widen and narrow its input schemas | accepted | not started (ENG-14550) | 2026-11-11 |
| [0012](0012-staging-warehouses.md) | A staging warehouse is an ordinary Database, owned by the customer | proposed | not started | 2026-11-10 |
