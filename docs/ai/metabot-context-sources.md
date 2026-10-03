---
title: Helping Metabot understand your data
summary: How to give Metabot the context it needs, including descriptions, metadata, and admin settings, so it can find and understand your data.
---

# Helping Metabot understand your data

Metabot is only as good as the context it can find. Most of this context is controlled by you, like descriptions, metadata, and a few admin settings. This guide walks through how to provide context in a way that actually makes a difference.

## Where Metabot looks depends on where you're talking to it

The two places you meet Metabot work differently:

- **The AI chat sidebar.** Metabot can search everything you have permission to see, which means questions, models, metrics, dashboards, and tables.
- **Natural-language querying** (admin settings under **AI exploration**). Metabot only considers content that has been curated for it: entities published to the Library (if you have Library access) or content in a collection an admin picks (on plans without Library retrieval).

This distinction is important to understand, because Metabot ends up seeing different types of context depending on where and how it is invoked.

## Write descriptions that explain what things mean

Meaningful descriptions are the most impactful piece of context. Metabot reads descriptions when someone has an item open and when it looks up an item. When it searches, descriptions are part of what search matches your question against.

Write descriptions that say what a table, model, metric, or column *means to the business* and which questions it answers. Metabot already knows the column types; what it doesn't know is your encoding and task.

Prioritize columns whose names are generic or could be misunderstood: codes, flags, anything called `status`, anything with an internal encoding. One short but clear paragraph can make all the difference.

Keep each description to a single paragraph. Line breaks in field descriptions can garble how the surrounding metadata is presented to the model.

## Add glossary terms for your company's vocabulary

[The glossary](../exploration-and-organization/data-model-reference.md#glossary) (in **Data Studio** > **Glossary**) is the way to teach Metabot words: acronyms, product names, and any term whose meaning at your company isn't the dictionary one. Metabot sees the glossary with every question, no matter where you use it.

Adding and editing terms requires a data analyst or admin role, but anyone can read them.

Two things to know:

- Metabot only sees your 100 most recently updated terms. If you have more, the oldest-edited ones are quietly left out. Keep the list focused.
- Definitions have no length limit, but every definition is included with every question everyone asks. Keep them short.

## Define measures and segments for the numbers people get wrong

If people keep computing "active customer" or "net revenue" slightly differently, define it once as a [measure](../data-studio/measures.md) or [segment](../data-modeling/segments.md) in the table's metadata. This is stronger than a description: Metabot is explicitly told to use your measures and segments instead of inventing its own aggregations and filters. Descriptions, in contrast, are merely hints.

There's an important distinction here between measures and segments, which live on tables and models, and [metrics](../data-modeling/metrics.md). When someone has a table open, Metabot sees that table's measures and segments, but not metrics built on it.

## Hide what nobody should be querying

Removing clutter helps as much as adding context.

- **Hide tables** people shouldn't query (in [**Data Studio**](../data-studio/overview.md), set the table's visibility to hidden). A hidden table disappears from Metabot's search entirely.
- **Mark sensitive columns as Sensitive.** Sensitive and retired fields are excluded from every column listing Metabot sees.
- **Data permissions apply to Metabot too.** Metabot can never describe a table or read content that the person asking doesn't have permission to see. If you want to limit what Metabot can look at for a group, consider setting [data permissions](../permissions/introduction.md).

## Curate your best content, then consider requiring it

Metabot's search results flag which items are curated, meaning they are verified, in an official collection, published to the Library, or from an authoritative table. Metabot prefers curated items when picking what to use, so verifying your canonical models and metrics, or moving them into official collections, nudges Metabot in the right direction.

Admins can go further with the **Only use verified or curated content** toggle in **Admin settings** > **AI** > **Metabot**. This is a hard filter, not a preference: with it on, uncurated content won't show up in Metabot's searches at all.

Turn it on only once enough content is actually curated. If nothing qualifies, Metabot's searches come back empty, and it will seem like Metabot suddenly can't find anything.

## Use custom instructions for house style, not facts

Admins can add custom instructions in [**Admin settings** > **AI**](./settings.md#configure-metabot). There are separate instruction settings for the chat sidebar and for natural-language querying (and another one for SQL generation). Whatever you write there is included with every conversation on that surface.

Because instructions are always present and never filtered by relevance, they're the right place for things that are always true:

- Tone and formatting preferences.
- Defaults: "Always break results out by fiscal quarter; our fiscal year starts in February."
- Steering: "Prefer the models in the Finance collection over raw tables."

They're the wrong place for facts about specific tables or columns, however. Descriptions are the right choice for that, since these facts travel with the entity instead of taxing every conversation.

Keep custom instructions brief: when they become long enough to compete with the actual question, they make answers worse instead of better.

## Let Metabot see real values for the columns that matter

When someone asks "show me churned customers," Metabot writes a better filter if it knows the status column's actual values. Whether it can see them depends on the field's **Filtering on this field** setting in Data Studio:

- **A list of all values** (or the automatic default): Metabot can look up real sample values.
- **Search box** or **Plain input box**: Metabot only gets summary statistics, never the values themselves.

For any column whose specific values people filter on, like status columns, categories, region codes. Make sure the setting is a list of all values.

## For natural-language querying, publish to the Library first

If your plan includes the [Library](../data-studio/library.md), natural-language querying (AI exploration) *only considers entities published to it*. This means an unpublished table is invisible to natural-language querying no matter how well it's described. In this case, make sure to:

1. **Publish the right entities.** Publish tables and move the models and metrics you want available into the Library collection (or a collection inside it). Plain saved questions can't be published, but you can build a model instead.
2. **Then make them findable.** Retrieval matches against each entity's name and description, so the description advice above applies double here.

If the Library is thin or entities are poorly described, the visible symptom is Metabot asking clarifying questions instead of answering. That means that it found matches, but it wasn't confident about them.

### Add synonyms, example questions, and usage instructions

Published entities can carry extra AI context, currently only possible to set by an admin through the API:

- **Synonyms** and **example questions** change whether the entity gets found. Add the words and phrasings people actually use ("MRR", "how much did we make last month?").
- **Usage instructions** change how Metabot uses the entity once found ("always filter out internal test accounts").

### Without the Library, pick a collection instead

On plans without the Library (including open source), natural-language querying falls back to searching a single collection. Set **Collection for natural language querying** in **Admin settings** > **AI** > **Metabot** to a collection containing your curated models and metrics, so Metabot searches a well-tended garden instead of nothing in particular.

## Tips for people asking questions

A few habits get better results when asking Metabot questions, independent of any other changes:

- **Open the thing you're asking about before you ask.** When you have a table or model open, Metabot sees all of its columns and their descriptions, its measures and segments, and even the related tables it joins to. It's the cheapest way to give Metabot exactly the right context.
- **Dashboards are the exception.** Opening a dashboard tells Metabot almost nothing by itself, other than the name and description. Metabot can look inside on request, but if your question is really about one chart, open that chart.
- **In the chat sidebar, your recent activity helps.** Metabot can see your most recently viewed items, so clicking through the relevant table or question first gives it a head start. This doesn't apply to natural-language querying, which deliberately ignores recent activity and sticks to curated content.

## What doesn't help (so you don't waste time on it)

A few perfectly reasonably things don't actually help:

- **Caveats and points of interest.** These metadata fields on tables and columns are never shown to Metabot. Put anything Metabot needs into the description instead.
- **Table display names.** Renaming a table's display name helps Metabot's search *find* the table, but the model then works with the raw database name. Column display names, on the other hand, do reach the model. That's why renaming a cryptic column helps quite a bit.
- **Semantic types.** Marking a column as an email address or a URL improves the Metabase UI, but Metabot isn't told about it. If the semantic meaning matters, say it in the description.
- **Verifying a card to get it into the Library.** Verification and the Library are separate systems. Verification is a curation signal for search; only publishing puts something in the Library.

