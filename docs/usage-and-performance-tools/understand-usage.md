---
title: Understand usage
summary: Find popular and unused content, count and find content, check what depends on a table before you change it, find inactive people, and see how embedded analytics and AI tools are used.
---

# Understand usage

{% include plans-blockquote.html feature="Usage analytics" %}

These recipes show what people use and what they don't: popular content, content you can clean up, inactive accounts, embedded analytics, and AI tools. Some questions have a ready-made answer in [Monitor](../monitor/start.md). Where they do, the recipe says so; use [usage analytics](./usage-analytics.md) when you need history or a custom report.

To keep a question you build, save it to the **Custom reports** collection inside Usage analytics. For the columns in each model, see the [Usage analytics reference](./usage-analytics-reference.md).

## Find the most viewed dashboards and questions

Open the **Most viewed content** dashboard for the most viewed dashboards, questions, models, and tables. The **Metabase metrics** dashboard adds weekly trends, like weekly active users and question views per week.

For a single item, open it, click the info button, and click **Insights**.

To count views over a custom window or by group:

1. Open the **View log** model.
2. Filter **Timestamp** to your window and **Entity Type** to `dashboard` or `card`.
3. Summarize by **Count**, grouped by **Entity ID**.
4. To group by team, join the **Group Members** model on **User ID** and group by **Group Name**.

## Count and find content

The **Content** model lists every question, model, dashboard, collection, and more, with **Created At**, **Creator ID**, **Collection ID**, and **Archived**.

- **How much content you have, and who made it.** Filter **Archived** to false, then summarize by **Count**, grouped by **Entity Type**, **Creator ID**, or **Created At: Year**.
- **A question you made recently but can't find.** Filter **Creator ID** to yourself and sort by **Created At**, newest first.
- **Which dashboards use a question.** Open the **Question overview** dashboard for the question and check **Dashboards with this question**, or filter the **Dashboard cards** model's **Card Qualified ID** to the question.
- **Which questions use SQL.** Filter **Question Is Native** to true.

To list every table and field across your connected databases, for example to search for a column name or export a data dictionary, use the **Tables** and **Fields** models.

## Find content nobody uses

The fastest answer is [Content diagnostics](../monitor/content-diagnostics.md). Its **Stale** tab lists items that nobody has viewed or run in 90 days, and you can move them to the trash from there.

For a different cutoff, or to review before you clean up, use the **Content with cobwebs** dashboard in Usage analytics. To build your own list:

1. Open the **Content** model and filter **Entity Type** to `dashboard` or `question`.
2. Join the **View log** model on **Entity ID**, and summarize by **Max of Timestamp** to get each item's last view.
3. Filter the last view to before your cutoff.

An item nobody opens can still be in use. Questions that dashboard subscriptions and alerts run show up in the **Query log**, not the **View log**. Before you delete something, [check what uses it](#check-what-uses-a-table-or-model-before-you-change-it).

## Find duplicate and disorganized content

Open [Content diagnostics](../monitor/content-diagnostics.md) in Monitor. Besides **Stale**, it has tabs for:

- **Duplicated**: items with the same name as another item of the same type.
- **Empty**: empty collections and dashboards, and questions whose last run returned nothing.
- **Sparse** and **Crowded**: collections and dashboards with too few or too many items.

You can move findings to the trash or dismiss them from there.

Two items with the same name aren't always duplicates. Before you trash one, check which one people actually open (**View log**) and what depends on it.

## Check what uses a table or model before you change it

To see which questions, models, and dashboards depend on a table or model, use the [dependency graph](../data-modeling/tools/graph.md) or [Dependency diagnostics](../monitor/dependency-diagnostics.md).

To see whether people still use those dependents, filter the **Query log** model's **Card ID** to them and check **Started At** for the last run.

## Find people who haven't logged in recently

1. Open the **People** model.
2. Filter **Is Active** to true and **Last Login** to before your cutoff.

To base it on what people viewed rather than when they logged in, use the **View log** model: summarize by **Max of Timestamp**, grouped by **User ID**.

To deactivate inactive people automatically, run the question on a schedule from your own tooling and deactivate them with the [API](../api.html).

**Last Login** only shows the most recent login. For counts of active people by week, the **Metabase metrics** dashboard has **Weekly active users**.

## See how embedded analytics are used

Open the **Embedding usage** dashboard. It breaks views down by authentication method, embedding client, host, and tenant, and lists the most viewed embeds.

For details, filter the **View log** or **Query log** model by **Auth Method**, **Embedding Client**, **Embedding Hostname**, or **Tenant ID**.

Views of guest embeds and public links have no Metabase account attached, so you can't break them down by person. If you [collect user data](./usage-analytics.md#turn-on-user-data-collection-to-see-ip-addresses-and-user-agents), **Embedding Path** and the query **Parameters** show which filter values people requested.

## See how people use Metabot, MCP, the CLI, and data apps

These tools have their own reports:

- **Metabot and other AI features**: [AI usage auditing](../ai/usage-auditing.md) shows usage stats like tokens and messages, and lets reviewers read conversations.
- **MCP clients**: [MCP analytics](../ai/mcp.md#mcp-analytics) shows which clients connect and which tools they call.
- **The Metabase CLI**: [CLI analytics](../monitor/cli-analytics.md) shows which operations run, who runs them, and when each person last used it.
- **Data apps**: [Data app analytics](../monitor/data-app-analytics.md) shows the questions and actions data apps run, and what fails.

For custom reports on AI usage, the Usage analytics collection has the **AI Usage Log**, **Metabot Conversations**, and **Metabot Messages** models.

AI usage, API key, and CLI data have their own retention setting, separate from the rest of usage analytics.

## Further reading

- [Usage analytics](./usage-analytics.md)
- [Usage analytics reference](./usage-analytics-reference.md)
- [Audit activity](./audit-activity.md)
- [Troubleshoot performance and notifications](./troubleshoot-performance-and-notifications.md)
