---
title: CLI analytics
summary: See which operations the Metabase CLI runs, who runs them, and when each person last used the CLI.
---

# CLI analytics

{% include plans-blockquote.html feature="CLI analytics" %}

_Monitor > CLI analytics_

The CLI analytics page shows how people are using the [Metabase CLI](../installation-and-operation/metabase-cli.md) with your Metabase. Metabase records one row for every API call the CLI makes, so you can see whether anyone has picked up the CLI, which operations they run, how often they run them, and when each person last used it.

Admins and people in groups with [Monitoring access](../permissions/application.md#monitoring-access) can view CLI analytics. See [Permissions for Monitor](./start.md#permissions-for-monitor).

The page has two tabs:

- **Usage**: charts that summarize CLI activity over the date range you pick.
- **Calls**: one row per call, so you can look at individual requests.

Both tabs share the same filters.

## Filters

- **Date range**: the time window the page covers. Defaults to the previous 30 days.
- **User**: limit to a single person (or **All users**).
- **Group**: limit to a single [group](../people-and-groups/managing.md) (or **All groups**).
- **Tenant**: limit to a single [tenant](../embedding/tenants.md). Only shows up if tenants are enabled.

## Usage

The Usage tab summarizes the calls that match your filters:

- **Calls by client over time**: a time series of call volume, split by client.
- **Calls by client**: how many calls came from the Metabase CLI versus everything else. See [How Metabase identifies clients](#how-metabase-identifies-clients).
- **Calls by operation**: which operations get called most, like `GET /api/card/:id`.
- **Calls by user**: who makes the most calls.
- **User activity**: a table of everyone who has used the CLI, including when they were last active. Use it to spot people who tried the CLI once and stopped, or credentials that are still running calls after someone has moved on.

### Error charts only appear when calls have failed

If any calls in your date range failed, Metabase adds an **Errors** section below the charts with:

- **Calls by status over time**: successful calls next to failed ones.
- **Errors by operation**: which operations fail most.

Widen the date range if you're expecting errors and don't see the section.

## Calls

The Calls tab lists individual calls, newest first. For each call, Metabase shows:

- **ID**: an identifier for the record, unique to each call.
- **Created at**: when the call came in.
- **Operation**: the HTTP method and API path, like `GET /api/card/:id`.
- **Client**: **Metabase CLI** or **Other**.
- **User**: who made the call.
- **Tenant**: the caller's [tenant](../embedding/tenants.md). Only shows up if tenants are enabled.
- **IP address**: where the call came from. Only shows up if you [turn on PII retention](#turn-on-pii-retention-to-see-ip-addresses-and-error-messages).
- **Status**: `success` or `error`. Metabase counts any response of 400 or above as an error.
- **Duration (ms)**: how long the call took, in milliseconds.
- **Error message**: why a failed call failed. Only shows up if you [turn on PII retention](#turn-on-pii-retention-to-see-ip-addresses-and-error-messages), and Metabase truncates long messages.

You can sort by **Created at**, **Operation**, **Client**, **User**, **Status**, or **Duration (ms)**.

## How Metabase identifies clients

Metabase reads the `User-Agent` header the caller sends. A caller that identifies itself as `metabase-cli/<version>` shows up as **Metabase CLI**; everything else, including callers that send no user agent at all, shows up as **Other**.

Clients report their own user agent, so treat the Client column as a usage signal, not a security control. Metabase never uses the client name to decide what a caller is allowed to do. Permissions are handled by the [permissions](../permissions/start.md) of the person who authenticated the CLI or [API key](../people-and-groups/api-keys.md) behind the call.

## Turn on PII retention to see IP addresses and error messages

The IP address and Error message columns stay empty unless you turn on [`MB_ANALYTICS_PII_RETENTION_ENABLED`](../configuring-metabase/environment-variables.md#mb_analytics_pii_retention_enabled), which controls whether Metabase stores personally identifiable information alongside its analytics. PII retention is off by default.

## How long Metabase keeps CLI call data

Once a day, Metabase deletes call records older than [`MB_AI_USAGE_MAX_RETENTION_DAYS`](../configuring-metabase/environment-variables.md#mb_ai_usage_max_retention_days). The same setting controls retention for [AI usage auditing](../ai/usage-auditing.md) data, so changing it affects both.

## Further reading

- [Metabase CLI](../installation-and-operation/metabase-cli.md)
- [Agent API](../ai/agent-api.md)
- [AI usage auditing](../ai/usage-auditing.md)
- [Monitor overview](./start.md)
