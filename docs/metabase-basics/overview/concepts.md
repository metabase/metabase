---
title: "Metabase concepts"
summary: "A quick overview of the core concepts in Metabase."
category: Getting started
---

<!-- TODO: Figure out if InPagePromoTourWebinar needs to be ported, and if so, how -->
import InPagePromoTourWebinar from "@/includes/shared/in-page-promo-tour-webinar.astro";

<InPagePromoTourWebinar />

## Overview

Metabase is a business intelligence (BI) platform that connects to [your databases](/data-sources) and gives you a bunch of tools to understand and share your data. Companies typically use Metabase to give their teams an easy way to query data, or to embed Metabase in their application to let customers explore data on their own.

> Coming from another BI tool? Check out our [transition guides](/learn/cheat-sheets/transition-guides/).

{% include youtube.html id='7esMaFvKGqo' %}

You can use Metabase to:

- Query your database with a [graphical query builder](#query-builder) or the [native query editor](#native-query-editor).
- Use [AI](#ai-in-metabase) to ask questions in plain language, generate SQL, and more.
- Save results as [Questions](#questions) and organize them into [dashboards](#dashboards) and [collections](#collections).
- Create [transforms](#data-studio) and [Metrics](#metrics) to standardize the datasets and calculations your team relies on.

## Core concepts

Metabase has a lot of tools (more than we can cover here), but here is the basic toolbox:

- [**Questions**](#questions) are saved queries with visualizations that you can add to dashboards or collections.
- [**AI**](#ai-in-metabase) is optional in Metabase, but we have you covered. Ask questions in plain language with Metabot, or connect AI tools via the MCP server or the Metabase CLI.
- [**Dashboards**](#dashboards) group related questions (charts and other cards) that can be filtered and refreshed together.
- [**Documents**](#documents) are like reports. Great for when you want to combine charts and text.
- [**Collections**](#collections) are like folders to organize and manage permissions for your questions, dashboards, and other items.
- [**Metrics**](#metrics) define the official way to calculate important numbers for your team.
- [**Data Studio**](#data-studio) is a workbench for analysts. It's where data teams prep data for everyone else, using transforms to build analytics-ready tables.

## Questions

![Question](https://cdn.metabase.com/learn/images/metabase-concepts/question.webp)

Questions are saved queries plus their visualization (you can toggle between a table and a chart). If you're coming from [Tableau](/learn/cheat-sheets/transition-guides/tableau-to-metabase), Questions are like worksheets; if [Power BI](/learn/cheat-sheets/transition-guides/powerbi-to-metabase), they're like Reports.

You can also [set up alerts](/docs/latest/questions/alerts) to get notified when your data meets certain conditions, and [export results](/docs/latest/questions/exporting-results) to CSV, XLSX, or JSON (or PNG for charts).

There are two main ways to create questions: the query builder, and the native code editor. (Or, optionally, just ask [Metabot](#ai-in-metabase).)

### Query Builder

![Query builder](https://cdn.metabase.com/learn/images/metabase-concepts/query-builder.png)

The query builder lets you create questions without knowing SQL. It provides a point-and-click interface where you can:

- Select the data you want to analyze.
- [Filter](/docs/latest/questions/query-builder/filters) to specific values or conditions.
- [Summarize and group data](/docs/latest/questions/query-builder/summarizing-and-grouping), sort, and add custom columns.
- [Join](/docs/latest/questions/query-builder/join) data from other tables.
- [Create visualizations](/docs/latest/questions/visualizations/visualizing-results) of your results.

Even SQL experts often use the query builder because:

- It's faster. You can drill through charts, group results, and iterate on a question just by clicking around.
- Metabase will pick a chart for you (which you can change and customize manually).
- The charts the query builder produces are interactive: you can [drill through charts](/docs/latest/questions/visualizations/drill-through) to explore further (unlike charts built with the native code editor).
- You can hand off the question to people who don't know SQL.
- It's surprisingly powerful: see [Custom expressions](/docs/latest/questions/query-builder/expressions).

### Native query editor

![Native query editor](https://cdn.metabase.com/learn/images/metabase-concepts/native-query-editor.png)

If you know SQL (or your database's query language), you can also create questions with the native editor. You can:

- Write complex queries with reusable code saved as [snippets](/docs/latest/questions/native-editor/snippets).
- Use [parameters](/docs/latest/questions/native-editor/sql-parameters) to make your queries dynamic and reusable.
- Reference [saved questions](/docs/latest/questions/native-editor/referencing-saved-questions-in-queries) in your SQL.
- Use database-specific functions.
- Do things that might not be possible in the query builder.

**There is one drawback compared to the query builder**: unlike the questions built with the query builder, people _won't_ be able to [drill through your charts](/docs/latest/questions/visualizations/drill-through).

## AI in Metabase

![AI input](https://cdn.metabase.com/learn/images/metabase-concepts/ai-input.webp)

Metabase gives you different ways to use AI to get answers and build stuff (AI is also completely optional).

- [Metabot](/docs/latest/ai/metabot) is Metabase's AI assistant. You can ask Metabot questions in plain language ("What was the average order value last month?"), have it [generate and debug SQL](/docs/latest/ai/sql-generation), and get it to explain charts, in Metabase or in Slack.
- Connect AI tools like Claude Code/Desktop to your Metabase via the [MCP server](/docs/latest/ai/mcp).
- Pair an agent with the [Metabase CLI](/docs/latest/installation-and-operation/metabase-cli) to create Metabase content via the API. See [Agent-driven development](/docs/latest/ai/file-based-development).

If you're embedding Metabase, you can also [embed AI chat](/docs/latest/embedding/sdk/ai-chat) in your own app, so your customers can ask questions about their data.

## Dashboards

![A dashboard in Metabase](https://cdn.metabase.com/learn/images/metabase-concepts/dashboard.webp)

Dashboards are a way to group and present related questions.

With dashboards, you can:

- [Arrange multiple questions](/docs/latest/dashboards/introduction) in a layout that makes sense.
- [Add filters](/docs/latest/dashboards/filters) that affect multiple questions at once.
- [Add text cards](/docs/latest/dashboards/introduction#adding-headings-or-descriptions-with-text-cards) to provide context and explanations.
- [Set up automatic refresh intervals](/docs/latest/dashboards/introduction#auto-refresh).
- [Make cards interactive](/docs/latest/dashboards/interactive).
- [Set up subscriptions](/docs/latest/dashboards/subscriptions) to automatically send dashboards via email, Slack, or a webhook.

## Documents

![A document in Metabase](https://cdn.metabase.com/learn/images/metabase-concepts/document-with-comment.webp)

[Documents](/docs/latest/documents/introduction) are reports that combine charts with markdown text you can comment on. Documents are handy when you want to tell the story around the numbers, or have an AI write up a written report, complete with charts.

## Collections

![Collections](https://cdn.metabase.com/learn/images/metabase-concepts/collections.png)

Collections work like folders: they're the file system for Metabase. You can use collections to:

- Group related content together: questions, dashboards, documents, and metrics. For example, to group all items for a specific team.
- Mark items as official (pro feature).
- Nest collections within other collections.
- Add [events and timelines](/docs/latest/exploration-and-organization/events-and-timelines) to track key dates and milestones.

## Metrics

![Metrics](https://cdn.metabase.com/learn/images/metabase-concepts/metrics.png)

Instead of everyone calculating important numbers (like revenue, active users, etc.) in their own way, you can standardize these calculations as [metrics](/docs/latest/data-modeling/metrics): a single source of truth you can include in any question or dashboard.

For example, you could create a "Monthly Revenue" metric that sums the totals in your `orders` table (excluding canceled orders) and groups them by month. Anyone can use that metric, so you won't end up with different revenue numbers in different dashboards.

To compare metrics side by side, check out the [Metrics Explorer](/docs/latest/questions/metrics-explorer).

## Data Studio

![The schema viewer in data studio](https://cdn.metabase.com/learn/images/metabase-concepts/schema-viewer.webp)

[Data Studio](/docs/latest/data-studio/overview) is the workbench where data teams can prep data so that everyone else (including AI agents like Metabot) gets the numbers right.

The main tool here is [transforms](/docs/latest/data-studio/transforms/transforms-overview): these scheduled queries turn raw, normalized data into clean, analytics-ready tables. For example, a "Customer Orders" transform could join your orders, people, and products tables, filter out test orders, and add calculated fields like "Total Lifetime Value".

Data teams also use Data Studio to curate metadata, publish vetted tables and metrics to the [Library](/docs/latest/data-studio/library), view a [dependency graph](/docs/latest/data-studio/dependencies/graph) of what a change would affect, and explore how your tables connect to each other with a fancy schema viewer.

You can also version your changes and push them to a git repo with [Remote Sync](/docs/latest/installation-and-operation/remote-sync).

## One last tip

Press `cmd + k` (Mac) or `ctrl + k` (Windows/Linux) to bring up the command palette. You can use it to:

- Search across all your Metabase content.
- Jump to specific items (questions, dashboards) or pages (like Admin settings).
- Create new questions and dashboards.
- Access recent items.
- Find documentation.

And press `?` to see all of Metabase's keyboard shortcuts.

Bon voyage!
