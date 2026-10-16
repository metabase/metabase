---
title: Configure Metabot context
summary: The metadata, content, and settings that change what Metabot can find and how it uses it.
---

# Configure Metabot context

Metabot answers questions using the metadata and content in your Metabase. This page lists what you can change to improve its answers, and what each change does.

## What Metabot searches depends on where people use it

| Where                                                       | What Metabot searches                                                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Chat sidebar](./metabot.md#the-metabot-chat-sidebar)       | Tables, models, metrics, questions, and dashboards the person has permission to see, plus their recently viewed items.                                                                          |
| [AI exploration](./metabot.md#ai-exploration)               | The [Library](#publish-tables-and-metrics-to-the-library), if you have one. Otherwise, the [collection for natural language querying](#without-a-library-point-ai-exploration-at-a-collection). |
| [SQL generation](./metabot.md#metabot-in-the-native-editor) | Tables in the database selected in the SQL editor.                                                                                                                                              |

Metabot also sees the item the person has open, any items they @-mention, and your [glossary](#define-company-terms-in-the-glossary). Metabot can only see what the person asking has [permission](../permissions/data.md) to see.

## Add descriptions to tables, columns, models, and metrics

Metabot reads an item's description when it looks at that item, and search matches questions against descriptions.

- Say what the item means to your business and which questions it answers. Metabot already knows column types.
- Start with columns that are easy to misread: codes, flags, anything called `status`, and anything with an internal encoding.

Admins and data analysts can edit table and column descriptions in [Data Studio](../data-modeling/metadata/managing-tables.md).

## Define company terms in the glossary

Add acronyms, product names, and terms with a company-specific meaning to the [glossary](../data-modeling/semantic-layer/glossary.md) in **Data Studio > Glossary**.

- Metabot gets the glossary with every message, in every place people use Metabot.
- Metabot only gets the 100 most recently updated terms.
- Keep definitions short, since they're sent with every message.

## Define measures and segments for calculations people get wrong

If people calculate "net revenue" or filter for "active customers" in slightly different ways, define the calculation once as a [measure](../data-modeling/semantic-layer/measures.md) or [segment](../data-modeling/semantic-layer/segments.md) on the table.

When Metabot looks at a table or model, it sees its measures and segments and is instructed to use them instead of writing its own. Metabot can't search for measures and segments directly, so they only help once Metabot has found the table.

## Build metrics and models for common questions

When more than one source could answer a question, Metabot prefers a [metric](../data-modeling/semantic-layer/metrics.md), then a [model](../data-modeling/models/models.md), then a saved question, and finally a raw table. Building metrics and models for your most common questions steers Metabot toward them.

## Hide tables and columns nobody should query

- **Tables**: In **Data Studio > Connected data**, set the table's [visibility layer](../data-modeling/metadata/managing-tables.md#visibility-layer) to **Hidden**. Metabot can't find or use hidden tables. Hidden tables also disappear from the query builder and stop syncing.
- **Columns**: Set the column's [visibility](../data-modeling/metadata/metadata-editing.md#field-visibility) to **Do not include**. Metabot never sees these columns. They also disappear from the query builder.

Neither setting is a permission: people can still query hidden tables and columns with SQL. To control what data Metabot can get to, use [data permissions](../permissions/data.md).

## Show Metabot real values for columns people filter on

Metabot can only look up a column's values if the column's [Filtering](../data-modeling/metadata/metadata-editing.md#filtering) setting is **A list of all values**. With **Search box** or **Plain input box**, Metabot only gets summary statistics, so it has to guess what values like `churned` or `EMEA` look like in your data.

Use **A list of all values** for columns that people filter on by name, like statuses, categories, and region codes. This setting also changes the filter widget people see.

## Restrict Metabot to curated content

{% include plans-blockquote.html feature="Verified or curated content" %}

In **Admin > AI**, on the **Internal** tab, turn on **Only use verified or curated content**. Metabot's search results, recently viewed items, and suggested prompts then only include content that's:

- [Verified](../exploration-and-organization/content-verification.md).
- In an [official collection](../exploration-and-organization/collections.md#official-collections).
- Published to the [Library](../data-modeling/semantic-layer/library.md). Published tables only count if their visibility layer is **Final**.

Turn this on only once you've curated enough content. If nothing qualifies, Metabot's searches come back empty. See [Verified or curated content](./settings.md#verified-or-curated-content).

## Publish tables and metrics to the Library

{% include plans-blockquote.html feature="Publishing tables to the Library" %}

If your Metabase has a [Library](../data-modeling/semantic-layer/library.md), AI exploration searches it first, matching questions against each item's name and description.

- [Publish tables](../data-modeling/semantic-layer/published-tables.md) in **Data Studio > Semantic layer**.
- Move metrics into the **Library > Metrics** collection.
- Add descriptions to everything you publish.

The Library only holds tables, metrics, and SQL snippets. You can't add models or questions to it.

AI exploration can still look at tables outside the Library, but it starts with what's in the Library. If nothing in the Library matches a question well, Metabot asks the person to clarify instead of guessing.

## Without a Library, point AI exploration at a collection

In **Admin > AI**, on the **Internal** tab, set **Collection for natural language querying** to a collection with your best models and metrics. AI exploration then only searches that collection and its subcollections. People can still @-mention items outside it. See [Collection for natural language querying](./settings.md#collection-for-natural-language-querying).

## Use system prompts for conventions, not facts

{% include plans-blockquote.html feature="AI system prompts" is_plural=true %}

In **Admin > AI > System prompts**, you can write separate instructions for **AI chat**, **Natural language queries**, and **SQL generation**. Metabot gets the matching prompt with every message.

- **Good for**: tone, formatting, and conventions that always apply, like "Our fiscal year starts on February 1."
- **Not for**: facts about specific tables or columns. Put those in descriptions, which Metabot only reads when it uses that item.

Keep system prompts short. See [AI system prompts](./system-prompts.md).

## Open the item before asking about it

When a table, model, or question is open, Metabot sees its columns and their descriptions, its measures and segments, and the tables it joins to. Opening the right item first is the most direct way to point Metabot at the right data.

In the chat sidebar, Metabot also sees recently viewed items, so viewing a relevant table or question first helps. AI exploration ignores recently viewed items.

## Some changes don't affect Metabot

- **Table display names**: Metabot works with the table's name in the database, not the display name you set. However, column display names do reach Metabot.
- **Why this table is interesting** and **Things to be aware of about this table** in [Data Reference](../exploration-and-organization/data-model-reference.md): Metabot never sees these, put that information in the description instead.
- **Verification doesn't add content to the Library.** Verified items count as curated content, but only publishing or moving an item puts it in the Library.
