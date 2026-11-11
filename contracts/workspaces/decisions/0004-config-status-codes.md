# 0004. 422 when an admin must fix something; 409 only for "not provisioned"

- Status: accepted
- Implemented: in review (#86584 incl. #86585, #86787)
- Date: 2026-11-10

## Context

`GET /config` can fail because the workspace isn't provisioned yet (wait and retry) or because of something only an admin can fix. With 409 for both, a client can't tell them apart.

## Decision

`GET /config` returns 422 when an admin must act. 409 means only "not provisioned yet, retry".

## Alternatives rejected

- Keep 409 and add a cause code in a JSON body: every client must parse the body to decide whether to retry.
- Keep plain-text 409s and document the messages: message text becomes API.

## Consequences

Clients should retry a 409 and show a 422's message to a person, not retry it.

## Resources

- https://github.com/metabase/metabase/pull/86584
- https://github.com/metabase/metabase/pull/86585
- https://github.com/metabase/metabase/pull/86787
