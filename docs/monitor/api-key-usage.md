---
title: API key usage
summary: See which API keys are still in use, which routes they call, and which tools call them.
---

# API key usage

{% include plans-blockquote.html feature="API key usage" %}

_Monitor > API key usage_

The API key usage page shows how [API keys](../people-and-groups/api-keys.md) get used against your Metabase. Use it to see which endpoints a key calls, find keys nobody's used in a while, or spot traffic you weren't expecting.

Metabase records one row for every API request authenticated with an API key. Requests that authenticate some other way, like a session cookie, SSO, or JWT, don't show up here.

Only admins can view API key usage. Unlike most Monitor pages, people in groups with [Monitoring access](../permissions/application.md#monitoring-access) can't open it.

To get to the page, you can also click **View API key usage** on the API keys management page. See [Managing API keys](../people-and-groups/api-keys.md#managing-api-keys).

The page has two tabs:

- **Usage**: Charts and a table that summarize API key activity over the date range you pick.
- **Events**: One row per request, to see individual API calls.

## Filters

Both tabs share the same set of filters.

- **Group**: Limit to keys in a single [group](../people-and-groups/managing.md#groups) (or **All groups**). Each API key belongs to one group, the group that sets its permissions.
- **API key**: Limit to a single key (or **All API keys**). If you've picked a group, the list only includes keys in that group.
- **Date range**: The time window the page covers. Defaults to the last 30 days.

## Usage

The Usage tab shows a dashboard summarizing the calls that match your filters. Click on any column heading to sort the table, click again to reverse the sort order.

- **Key activity**: Every API key that matches your filters, its group and when it was last used. Keys with the most recent activity show up first by default.
- **Calls over time**: A line chart of daily call volume.
- **Calls by client**: A pie chart broken down by which tools make the calls, like curl or the Metabase CLI. See [How Metabase identifies clients](#how-metabase-identifies-clients).
- **Calls by route**: A bar chart of which API endpoints get called most, like `/api/card/:id`. Less common routes are grouped together under **Other**.

### Last used only covers the date range you've picked

Note that the **Last used** column in **Key activity** shows each key's most recent call _within the date range_. A key with no calls in that range shows a blank, even if someone used it before the range started.

To find keys that nobody uses anymore, widen the date range. A key that's still blank across the whole period Metabase keeps data for hasn't been used in that time. See [How long Metabase keeps API key usage data](#how-long-metabase-keeps-api-key-usage-data).

## Events

The Events tab lists individual calls, newest first. Click on any column heading to sort the table, click again to reverse the sort order.

- **ID**: An identifier for the record, unique to each call.
- **Occurred at**: When the call came in.
- **Route**: The API endpoint the call hit, like `/api/card/:id`. See [What the Route column records](#what-the-route-column-records).
- **Method**: The HTTP method, like `GET` or `POST`.
- **Status**: The HTTP status code of the response. See [A 202 status doesn't mean the request succeeded](#a-202-status-doesnt-mean-the-request-succeeded).
- **Duration (ms)**: How long the call took, in milliseconds.
- **API key**: The name of the key that authenticated the call.
- **Created by**: The person who created the API key. That's not necessarily whoever is making the calls: anyone with a copy of the key can use it.
- **Client**: The tool that made the call. See [How Metabase identifies clients](#how-metabase-identifies-clients).
- **Embedding client**: The value of the `X-Metabase-Client` header, if the caller sent one. Most API key traffic doesn't send this header, so this column is usually empty.
- **Embedding hostname**: The hostname of the page that embedded Metabase, if the caller sent one. Like **Embedding client**, this column is usually empty.
- **IP address**: Where the call came from. Only shows up if you [turn on PII retention](#turn-on-pii-retention-to-see-ip-addresses).

### What the Route column records

Metabase records the route template, not the full URL. A call to `/api/card/123` shows up as `/api/card/:id`, so calls to the same endpoint get counted together, no matter which item they asked for. Metabase never records query strings or IDs.

You might also see two special values:

- `(unmatched)`: The call went to an API path that doesn't exist, and Metabase returned a 404. Causes for this include typos, testing, and people probing for endpoints.
- `(no-template)`: The call reached Metabase, but not a regular API endpoint. This includes health checks and requests Metabase declined before they got to an endpoint.

### A 202 status doesn't mean the request succeeded

Some responses, like query results, stream back to the caller. Metabase has to record the status before the stream finishes, so streamed responses always show a status of `202`, whether the query succeeded or failed. Any status of 400 or above means the call failed.

## How Metabase identifies clients

Metabase reads the `User-Agent` header the caller sends, and sorts each call into one of these clients:

- **Metabase CLI**: The [Metabase CLI](../installation-and-operation/metabase-cli.md).
- **curl**: The `curl` command-line tool.
- **Postman**: The Postman API client.
- **Python**: Python scripts that use the `requests` library. Other Python HTTP libraries show up as **Other**.
- **R**: R scripts that use the `curl` package, or `httr`, which is built on it.
- **Node.js**: Node.js scripts that use the `got` library. Other Node.js HTTP libraries show up as **Other**.
- **Other**: Everything else, including callers that don't send a user agent.

Clients report their own user agent, so the Client column can only serve as a usage signal, not a security check. Metabase never uses the client to decide what a caller is allowed to do. An API key's permissions come from its [group](../people-and-groups/api-keys.md).

## Logging is delayed and skipped under heavy load

Metabase saves API key usage in batches, so calls can take a few seconds to appear on the page.

API key usage is for spotting patterns, not for auditing every request. When an instance gets a lot of API key traffic in a short time, Metabase may skip recording some calls instead of slowing down the requests themselves. If that happens, Metabase writes a warning to its [logs](./application-logs.md).

## Turn on PII retention to see IP addresses

The IP address column stays hidden unless you turn on [`MB_ANALYTICS_PII_RETENTION_ENABLED`](../configuring-metabase/environment-variables.md#mb_analytics_pii_retention_enabled), which controls whether Metabase stores personally identifiable information alongside its analytics. PII retention is off by default. With PII retention on, Metabase also stores each call's full user agent, though the page doesn't show it.

Metabase doesn't store error messages for API key calls, even with PII retention on. Error messages from the API often repeat the data someone sent in their request, like the SQL in a native query. Use the **Status** column to tell failed calls from successful ones.

## How long Metabase keeps API key usage data

Once a day, Metabase deletes call records older than [`MB_AI_USAGE_MAX_RETENTION_DAYS`](../configuring-metabase/environment-variables.md#mb_ai_usage_max_retention_days). The same setting controls retention for [AI usage auditing](../ai/usage-auditing.md) and [CLI analytics](./cli-analytics.md) data, so changing it affects all of them.

Deleting an API key doesn't delete its usage history. Calls from a deleted key still count in the charts and show up on the Events tab, but without a key name, until they're old enough for Metabase to delete.

## Further reading

- [API keys](../people-and-groups/api-keys.md)
- [CLI analytics](./cli-analytics.md)
- [Monitor overview](./start.md)
