---
title: Audit activity
summary: Find out who did what in your Metabase, including changes to content and settings, what someone viewed or queried, downloads, public links, and what to check after a suspected security incident.
---

# Audit activity

{% include plans-blockquote.html feature="Usage analytics" %}

These recipes answer "who did what, and when" with the models in the [Usage analytics](./usage-analytics.md) collection, plus a few tools in [Monitor](../monitor/start.md). You'll need view access to the Usage analytics collection, which only admins have by default.

Most recipes start the same way: open the **Usage analytics** collection, open a model, then filter it with the query builder. To keep a question you build, save it to the **Custom reports** collection inside Usage analytics. For the columns in each model, see the [Usage analytics reference](./usage-analytics-reference.md).

The models identify people by **User ID**. To see names, join to the **People** model on **User ID**, or look up the ID in **Admin** > **People**.

## See what someone did in your Metabase

Open the **Person overview** dashboard and pick the person. It shows what they viewed, the queries they ran, their downloads, their recent activity, and the groups they're in.

For a specific time window, filter the models directly:

1. Open the **View log** model to see what they looked at, the **Query log** model to see the queries they ran, or the **Activity log** model to see what they changed.
2. Filter **User ID** to the person.
3. Filter the timestamp column (**Timestamp** in the View log and Activity log, **Started At** in the Query log) to the window you care about.

To see when someone signed in, how, and from what device, use [Session management](../monitor/session-management.md). It lists active sessions and sessions that ended in the last 30 days, and you can revoke sessions from there.

Usage analytics only keeps each person's most recent login (**Last Login** on the **People** model), and Session management only keeps ended sessions for 30 days, so there's no complete login history.

## See who created, changed, or deleted a question or dashboard

**If it was moved to the trash**, open [Trash](../exploration-and-organization/delete-and-restore.md) and sort by who deleted it or when. You can restore it from there. You'll only see items from collections you have curate access to.

**If it was edited**, open the item and check its [history](../exploration-and-organization/history.md). History lists every save, move, and move to the trash, with who did it, and you can revert to an earlier version.

**If it was deleted permanently**, or to search across all items at once, use the Activity log:

1. Open the **Activity log** model.
2. Filter **Topic** to the kind of change:
   - Questions and models: `card-create`, `card-update`, `card-delete`
   - Dashboards: `dashboard-create`, `dashboard-delete`, `dashboard-add-cards`, `dashboard-remove-cards`
3. To narrow to one item, filter **Entity ID** to its ID (the number in its URL).
4. Check **User ID** for who made the change, and **Details** for what changed.

Changes to collections aren't recorded, so usage analytics can't tell you who moved or deleted a collection.

## See who changed a setting

1. Open the **Activity log** model.
2. Filter **Topic** to `setting-update`.
3. The **Details** column shows the setting and, for most settings, the old and new values.

Related topics:

- `cache-config-update` for caching policies.
- `channel-create` and `channel-update` for notification channels like Slack or webhooks.
- `api-key-create`, `api-key-update`, `api-key-regenerate`, and `api-key-delete` for API keys.

## See who joined, left, or changed groups

1. Open the **Activity log** model.
2. Filter **Topic** to any of:
   - `user-invited` and `user-joined` for new accounts.
   - `user-update` for changes to someone's account.
   - `user-deactivated` and `user-reactivated`.
   - `group-membership-create` and `group-membership-delete` for people added to or removed from a group.
   - `password-changed`, `password-reset-initiated`, `mfa-enrolled`, and `mfa-disabled`.

For the current state, use the **People** model (**Date Joined**, **Last Login**, **Is Active**, **Is Admin**, **Sso Source**) and the **Group Members** model.

Changes to what a group can access (data and collection permissions) aren't recorded.

## See which API keys are in use and what they call

Open [API key usage](../monitor/api-key-usage.md) in Monitor. The **Usage** tab shows each key, its group, and when it was last used, plus calls over time, by client (like curl or the Metabase CLI), and by API route. The **Events** tab lists individual calls.

To see who created, changed, regenerated, or deleted a key, and when, filter the **Activity log** model's **Topic** to `api-key-create`, `api-key-update`, `api-key-regenerate`, and `api-key-delete`.

## See who queried a database or table

1. Open the **Query log** model.
2. Filter **Database ID** to the database.
3. To narrow to a table, filter **Query** to contain the table's name (for SQL questions) or its ID (for query builder questions). The **Query** column holds the query as JSON.
4. Check **User ID**, **Started At**, and **Result Rows**.

To see who browsed a table directly, open the **View log** model and filter **Entity Type** to `table`.

If a question uses [row and column security](../permissions/row-and-column-security.md), **Is Sandboxed** is true and **Sandbox Details** shows the policy Metabase applied, so you can confirm what the person could actually see.

## See who downloaded data

1. Open the **Query log** model.
2. Filter **Query Source** to the download types: `csv-download`, `xlsx-download`, and `json-download`. For embeds and public links, add the `embedded-` and `public-` versions, like `public-csv-download`.
3. **Result Rows** shows how many rows each download contained, **User ID** who downloaded it, and **Card ID** or **Dashboard ID** what they downloaded.

For one person or one question, the **Person overview** and **Question overview** dashboards each have a **Last downloads** card.

Downloads from guest embeds and public links don't have a Metabase account attached. If you [collect user data](./usage-analytics.md#turn-on-user-data-collection-to-see-ip-addresses-and-user-agents), **IP Address** and **User Agent** help tell them apart.

## See what's public and who's viewing it

To find everything that has a public link:

1. Open the **Content** model.
2. Filter **Made Public By User** to **Not empty**.

To see when public links were created or removed, filter the **Activity log** model's **Topic** to `card-public-link-created`, `card-public-link-deleted`, `dashboard-public-link-created`, or `dashboard-public-link-deleted`.

To see how people use public links, open the **Embedding usage** dashboard and check **Public link views** and **Most viewed public links**. For details, filter the **Query log** model's **Query Source** to `public-dashboard` and `public-question`.

## Investigate a suspected security incident

If you think someone misused an account, API key, or public link, work through these checks in order. Narrow every filter to the window you're investigating, and download the results of each question to attach to your report.

1. **Accounts.** In the **People** model, check for new accounts (**Date Joined**), unexpected admins (**Is Admin**), and accounts created outside SSO (**Sso Source** is empty). In the **Activity log**, check the topics in [See who joined, left, or changed groups](#see-who-joined-left-or-changed-groups).
2. **Sessions and API keys.** Revoke sessions in [Session management](../monitor/session-management.md). Check [API key usage](../monitor/api-key-usage.md) and the `api-key-` topics in the Activity log.
3. **What they accessed.** For each account of interest, follow [See what someone did](#see-what-someone-did-in-your-metabase). Then check [downloads](#see-who-downloaded-data) and [public links](#see-whats-public-and-whos-viewing-it).
4. **What changed.** Check `setting-update` and the content topics in the Activity log.
5. **Where requests came from.** If you collect user data, filter the **Query log** and **View log** by **IP Address**.

If you self-host Metabase on a Pro or Enterprise plan, also check [Security center](../installation-and-operation/security-center.md) for advisories that affect your version. Metabase Cloud instances are patched automatically.

Some things to keep in mind:

- Metabase only records IP addresses and user agents while [user data collection](./usage-analytics.md#turn-on-user-data-collection-to-see-ip-addresses-and-user-agents) is on. Turn it on now if you might need them later.
- Metabase deletes usage data older than the [retention period](./usage-analytics.md#how-long-metabase-keeps-usage-data) (720 days by default).
- Usage analytics only covers activity inside Metabase. For server or network logs on Metabase Cloud, contact support.

## Get notified when something happens

Any question built on these models can send an alert. For example, to get an email whenever someone creates an account that doesn't use SSO:

1. Open the **People** model.
2. Filter **Sso Source** to **Is empty** and **Date Joined** to **Today**.
3. Save the question to the **Custom reports** collection.
4. [Create an alert](../questions/alerts.md) that sends when the question has results.

The same pattern works for large downloads (download sources in the **Query log** with **Result Rows** over a threshold), new public links, or `setting-update` events.

## Further reading

- [Usage analytics](./usage-analytics.md)
- [Usage analytics reference](./usage-analytics-reference.md)
- [Understand usage](./understand-usage.md)
- [Troubleshoot performance and notifications](./troubleshoot-performance-and-notifications.md)
