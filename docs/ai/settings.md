---
title: Metabot AI settings
summary: Configure Metabot settings, including which collections Metabot can access, and learn tips for improving Metabot's performance through data modeling and metadata.
---

# Metabot AI settings

{% include beta-blockquote.html
   message="For now, <a href='https://www.metabase.com/features/metabot-ai'>Metabot</a> is only available as an add-on for Pro and Enterprise plans on Metabase Cloud."
%}

_Settings > Admin settings > AI_

This page covers admin settings for Metabase's AI assistant, [Metabot](./metabot.md).

![Admin settings for AI Metabot](./images/ai-settings.png)

## Verified content

Admins on Pro and Enterprise plans can tell Metabot to only work with [models](../data-modeling/models.md) and [metrics](../data-modeling/metrics.md) that have been [verified](../exploration-and-organization/content-verification.md).

Restricting Metabot to verified models and metrics (and only models and metrics) can help Metabot produce more reliable answers, since you know someone has at least vetted the data Metabot can use.

## When embedding Metabot, you can pick a collection for Metabot to have access to

When embedding Metabot in your app, you can select a collection for Metabot:

1. Go to **Settings** > **Admin settings** > **AI**.
2. Click **Embedded Metabot**.
3. In the **Collection Embedded Metabot can use** section, click **Pick a collection**.
3. Select the collection that contains the models and metrics you want Metabot to use.

Metabot will use the models and metrics in that collection to help answer questions and generate queries. You can change this collection at any time. To give Metabot access to all collections, you can set the collection to the root collection, called "Our Analytics" (the default).

Alternatively (or additionally), you can restrict Metabot to [verified content](#verified-content).

## Tips for making the most of Metabot

The best thing you can do to improve Metabot's performance is to prep your data like you would for onboarding a new (human) hire to your data. In practice, this means you should:

- [Add models and metrics to your Metabot collection](#add-models-and-metrics-to-your-metabot-collection)
- [Add descriptions for your data and content](#add-descriptions-for-your-data-and-content)
- [Make sure the semantic types for each field are correct](#make-sure-the-semantic-types-for-each-field-are-correct)
- [Curate prompt suggestions](#curate-prompt-suggestions)

### Add models and metrics to your Metabot collection

Create models that make it easy for Metabot to find answers to the kinds of questions you expect people to ask about your data. Create metrics that capture key business calculations that people frequently need to reference. Add these models and metrics to the collection you've designated for Metabot to learn from.

For example, if people often ask questions about customer lifetime value (LTV), create a model that joins customer data with order history and calculates LTV. Or if people frequently need to know monthly active users (MAU), create a metric that defines exactly how MAU should be calculated.

### Add descriptions for your data and content

Add descriptions to your [models](../data-modeling/models.md#add-metadata-to-columns-in-a-model), [metrics](../data-modeling/metrics.md), [dashboards](../dashboards/introduction.md), and [questions](../questions/introduction.md). Write descriptions to provide context, define terms, and explain business logic.

Admins can also curate [table metadata](../data-modeling/metadata-editing.md) by adding descriptions for tables and their fields.

For example, here's a decent description for an ID field that provides additional context for the data:

```txt
This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.
```

You can even ask Metabot to write descriptions for you. But Metabot will only have access to the data in the database. It can't know things like "this ID is called the 'Invoice number' in the web app", which is the kind of contextual information worth documenting.

### Make sure the semantic types for each field are correct

Make sure the semantic types for each field accurately describe the field's "meaning". For example, if you have a field like `created_at`, you'd want the column type to be Creation date.

Metabase will try to set semantic types automatically, but you should confirm that each field has the relevant semantic type. See [Data types and semantic types](../data-modeling/semantic-types.md). You can also set semantic types for [models](../data-modeling/models.md#add-metadata-to-columns-in-a-model).

### Curate prompt suggestions

When you select a collection for Metabot to "learn", Metabot will suggest a series of prompts based on the content it finds in that collection. These prompts just give people a feel for the kinds of things people can ask Metabot to do.

Admins can run these generated prompts to test the answers, or trash the individual prompts if they're not useful or misleading. You can also regenerate all the prompts with a click.

## Metabot permissions are Metabase permissions

Metabot inherits the permissions of the current user, so you don't need to set permissions specifically for Metabot. Whenever someone uses Metabot, Metabot can only see what that person has permissions to see and do.

In other words, to restrict what data Metabot can see for each person, simply apply [data](../permissions/data.md) and [collection](../permissions/collections.md) permissions to their groups as you would normally, and those permissions will apply to their use of Metabot as well.

## Metabot is only available instance-wide, not per person

Currently, Metabot will be available to everyone who uses your Metabase.

## Metabot uses a variety of generative AI models to answer your questions

Under the hood, Metabase powers Metabot with a variety of generative models. For now, you can't change which generative AI models Metabot uses, as Metabase's AI service handles their selection.

To get the best results, we (the Metabase team) use internal benchmarks to determine which AI models Metabot should use for different tasks. And we are constantly iterating on performance, so Metabot will continue to improve over time.

## We don't collect or store the prompts you send to Metabot

We've intentionally limited what Metabot can do. Metabot lacks access to API keys, and it can't create assets, write data, or send data outside of your Metabase. Your questions and conversations remain private to your Metabase. We do collect some metadata to gauge and improve usage, but we don't train Metabot on your prompts or your data—because we can't see them!
