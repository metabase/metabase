---
title: Translate your embeds
summary: "Upload a translation dictionary to translate the UI and content of embedded components like questions and dashboards into different languages."
---

# Translate your embeds

{% include plans-blockquote.html feature="Translation of embedded content" convert_pro_link_to_embedding=true %}

On every plan, you can set a locale on modular embeds (guest, SSO, and SDK) to translate Metabase's UI. On Pro and Enterprise plans, you can also upload a translation dictionary so that Metabase translates content strings (like dashboard names and filter labels) for all [modular embeds](./modular-embedding.md).

## Translate the UI

To translate Metabase's UI, like menus and filter widgets, set a `locale` in your embed configuration. Metabase translates UI elements automatically, so you don't need to add them to your dictionary. See [Set the language](./config.md#set-the-language).

To translate content you create, like dashboard names and filter labels, [add a translation dictionary](#add-a-translation-dictionary).

## Add a translation dictionary

The dictionary must be a CSV with these columns:

- **Language** with the locale code
- **String** with the string to be translated
- **Translation**

> Don't put any sensitive data in the dictionary. Anyone can see the dictionary, including viewers of public links.

To add a translation dictionary:

1. Go to **Embedding hub** > **Localization**.
2. Under **Translate embedded dashboards and questions**, click **Upload edited translation dictionary**.

For a starting point, click **Get translation dictionary template**. You'll get a CSV with the right columns, filled with your current dictionary if you've uploaded one, or a few sample rows if you haven't.

Uploading a new dictionary replaces the existing dictionary.

To remove a translation dictionary, upload a blank dictionary.

## Example translation dictionary

Metabase uses these dictionaries to translate user-generated content, like dashboard names in [modular embeds](./modular-embedding.md).

| Language | String      | Translation  |
| -------- | ----------- | ------------ |
| pt-BR    | Examples    | Exemplos     |
| pt-BR    | First tab   | Primeira aba |
| pt-BR    | Another tab | Outra aba    |
| pt-BR    | Title       | Título       |
| pt-BR    | Vendor      | Vendedor     |
| IT       | Examples    | Esempi       |

Use hyphens in locale codes, like `pt-BR`. Underscores also work, but the `locale` setting in modular embeds only accepts hyphens, so hyphens keep your dictionary and your config consistent. If you download the dictionary after uploading it, Metabase converts `pt-BR` to `pt_BR`.

[See a list of supported locales](../configuring-metabase/localization.md#supported-languages).

## Dictionary rules

Metabase matches each string in your content against the dictionary exactly, so how you write the strings matters.

### Use full phrases

Metabase doesn't tokenize strings for translation, so include exact phrases in your dictionary.

For example, if you have a dashboard called "Monthly Sales", translations of "Monthly" and "Sales" aren't enough. You also need "Monthly Sales" as a full string.

Exact matching also applies to punctuation and special characters. For example, if a question is titled "How many Widgets did we sell this week?", include that exact string, with the question mark, in the dictionary. Metabase treats "How many Widgets did we sell this week" as a different string.

### Translations are case-insensitive

Translations are case-insensitive. For example, if your translation dictionary has a translation:

| Language | String   | Translation |
| -------- | -------- | ----------- |
| pt-BR    | Examples | Exemplos    |

`Examples`, `examples`, and `EXAMPLES` are all translated as `Exemplos`. Metabase doesn't preserve the original case. It outputs the exact translation string from the dictionary.

### Include Markdown formatting

If the strings you want to translate include Markdown formatting, include the formatting in the dictionary. For example:

| Language | String         | Translation    |
| -------- | -------------- | -------------- |
| pt-BR    | `**Examples**` | `**Exemplos**` |
| pt-BR    | `_Examples_`   | `_Exemplos_`   |
| pt-BR    | `## Examples`  | `## Exemplos`  |

## The AI chat component isn't translated

One exception is that Metabase won't translate the text in the [AI chat component](./ai-chat.md). While Metabot can understand other languages, it works best in English.

## Further reading

- [Modular embedding](./modular-embedding.md)
- [Guest embedding](./guest-embedding.md)
- [Configure your embeds](./config.md)
