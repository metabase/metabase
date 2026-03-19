---
title: Agent API
summary: The Agent API is a REST API for building headless, agentic BI applications on top of Metabase's semantic layer, scoped to an authenticated user's permissions.

---

# Agent API

{% include plans-blockquote.html feature="Metabase agent API" %}

The Agent API is a REST API for building headless, agentic BI applications on top of Metabase's semantic layer, scoped to an authenticated user's permissions.

## Why use the Agent API

There are a few advantages to using the agent API over the Metabase API.

- Agent endpoints are explicitly supported for building agentic BI applications.
- The agent API is versioned, so your apps can rely on consistent responses.
- Supports JWT auth so requests can be scoped to a user's permissions.
- Doesn't require you to work with MBQL, which is Metabase's querying language.

## Supported features

The Agent API supports:

- Discovering tables and metrics
- Inspecting their fields
- Constructing and executing queries

Base path:[/api/agent](../api.html#tag/apiagent)

## Authentication

The Agent API uses stateless JWT authentication. JWT must be configured in Metabase admin settings (**Admin** > **Settings** > **Authentication** > **JWT**).

Pass a signed JWT directly in each request:

```
Authorization: Bearer <jwt>
```

The JWT must be signed with the shared secret configured in Metabase. Claims include:

| Claim      | Type   | Required | Description                                                                                                                  |
| ---------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| iat        | int    | Yes      | Issued-at time (Unix seconds). JWT must be <180 seconds old.                                                                 |
| email      | string | Yes      | Email matching a Metabase user. The claim name is configurable via the jwt-attribute-email admin setting (default: "email"). |
| first_name | string | No       | User's first name.                                                                                                           |
| last_name  | string | No       | User's last name.                                                                                                            |
| groups     | array  | No       | List of groups for group sync.                                                                                               |

Example JWT payload:

```json
{
  "iat": 1706640000,
  "email": "analyst@example.com"
}
```

## Example application

![Metabase Agent chat answering a product rating question](./images/agent-api-demo.png)

Check out the [Metabase Agent API demo](https://github.com/metabase/metabase-agent-api-demo) for a working example of an agentic BI app built on the Agent API.

## Further reading

- [Metabase Agent API demo](https://github.com/metabase/metabase-agent-api-demo)
- [Metabase API docs](../api.html)
- [JWT authentication](../people-and-groups/authenticating-with-jwt.md)
