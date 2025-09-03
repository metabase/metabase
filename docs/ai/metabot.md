---
title: Metabot - Metabase's AI assistant
summary: Metabot is Metabase's AI assistant that helps you analyze data, create charts, write SQL, fix errors, find content, and get answers from documentation.
---

# Metabot - Metabase's AI assistant

{% include beta-blockquote.html
   message="For now, <a href='https://www.metabase.com/features/metabot-ai'>Metabot</a> is only available as an add-on for Pro and Enterprise plans on Metabase Cloud."
%}

![Meet Metabot](./images/metabot.png)

Metabot helps you analyze your data by creating charts from natural language, generating SQL queries, fixing query errors, and analyzing existing visualizations.

To set up Metabot, see [Metabot settings](./settings.md).

## What Metabot can do

Metabot can help you to:

- Create a chart using the [query builder](../questions/query-builder/editor.md) from a natural language query.
- Generate SQL in the [native editor](../questions/native-editor/writing-sql.md) from natural language.
- [Analyze a chart](#analyze-charts-with-metabot).
- [Fix errors in SQL code](#have-metabot-fix-sql-queries).
- Answer questions from our documentation (as in, the literature you're reading right now).

Like with all generative AI, you'll always need to double-check results.

## The Metabot chat sidebar

![Metabot chat sidebar](./images/metabot-conversation-sidebar.png)

There are multiple ways to start a chat with Metabot:

- Type cmd+b on Mac, ctrl+b on Windows, to open up the [chat sidebar](#the-metabot-chat-sidebar).
- Click the Metabot icon in the search bar.
- Type cmd+k on Mac, or ctrl+k on Windows, to open the [command palette](../exploration-and-organization/exploration.md#command-palette). Select the Metabot option to **Ask me to do something, or ask a question**.

You can chat with Metabot (though predictably, it's only interested in helping you answer questions about your data).

Metabot will keep the context of the current question with each new prompt. Only the current conversation history is saved (you can scroll up to see it). If you start a new chat, Metabase will discard the previous conversation, so be mindful when resetting the conversation.

Some tips:

- Give Metabot as much context as you can. If you know the table or fields you want to query, tell Metabot.
- Whenever you want Metabot to do something completely different, you should reset the conversation, as Metabot might find that irrelevant historical context to be confusing.
- Once Metabot creates a question for you, you can follow up with more questions or take over yourself. You can drill through the chart or step into the editor to tweak the query (both in the query builder and the SQL editor).

### Metabot response menu

Hover over Metabot's response to:

- Copy the response.
- Give thumbs-up/thumbs-down feedback on responses.
- Re-run the prompt with Metabot. This is useful if you've updated the chart or just want to have Metabot take another pass (since AI responses aren't deterministic, Metabot may give a different response on another run).

## Analyze charts with Metabot

![Metabot analyzes a chart](./images/metabot-response.png)

When viewing a question, you can click the Metabot icon in the upper right to analyze a visualization. You can also open the command palette to tell Metabot to analyze the chart.

When viewing a table of results, Metabase won't display the Metabot button, but you can open the chat to ask Metabot to analyze the table, and it will produce an [X-ray](../exploration-and-organization/x-rays.md) of the results.

You can also ask Metabot to tell you about specific tables in your database.

## Metabot in the native editor

![Metabot will generate SQL from a highlighted prompt in natural language](./images/generate-sql-from-natural-language-prompt.png)

To have Metabot generate SQL for you:

1. Open the [SQL editor](../questions/native-editor/writing-sql.md).
2. Select the database you want to query.
3. Type cmd+b on Mac, ctrl+b on Windows, to open up the [chat sidebar](#the-metabot-chat-sidebar).
4. Ask it to "Write a SQL query that..." and type your prompt.

Metabot will generate the SQL for you, but it won't run the query. This gives you a chance to inspect the code before running it. The native editor is designed to be read-only (so don't worry about Metabot dropping any tables), but you should still check the query to make sure it targets the data you want.

If you don't specify a specific table in a natural language question, Metabot will only check the first 100 tables in the currently selected database. If your question pertains to tables other than those first 100 tables, Metabot may hallucinate the tables it needs, and the query will fail.

## Have Metabot fix SQL queries

![Metabot can try and fix SQL query errors](./images/have-metabot-fix-it.png)

When you get an error in a SQL query, you can click the **Have Metabot fix it** button, and Metabot will try to correct the query. You can also ask Metabot to fix your SQL in the chat.

## Navigating after Metabot creates a chart

If Metabot creates a query or takes you to a new item but you want to return to the previous screen, you can navigate using your browser's back button.

You can also save any chart that Metabot creates to a dashboard or collection.
