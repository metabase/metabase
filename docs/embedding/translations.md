---
title: Translate embedded dashboards and questions
summary: Upload a translation dictionary to translate questions and dashboards into different languages. Only available for static embeds.
---

# Translate embedded dashboards and questions

{% include plans-blockquote.html feature="Content translation for static embeds" convert_pro_link_to_embbedding=true %}

For now, translations are only available for [static embeds](./static-embedding.md), not Interactive embedding or the Embedded analytics SDK.

You can upload a translation dictionary to translate strings both in Metabase content (like dashboard titles) and in the data itself (like column names and values).

## Add a translation dictionary

The dictionary must be a CSV with these columns:

- **Language** with the locale code
- **String** with the string to be translated
- **Translation**

> Don't put any sensitive data in the dictionary, since anyone can see the dictionary—including viewers of public links.

Uploading a new dictionary will replace the existing dictionary.

To remove a translation dictionary, upload a blank dictionary.

## Translate content in static embeds

To translate content in a static embed using the uploaded dictionary, add the [`locale` parameter](./static-embedding-parameters.md#setting-the-language-for-a-static-embed) to the embed URL:

```
https://metabase.example.com/public/dashboard/7b6e347b-6928-4aff-a56f-6cfa5b718c6b?category=&city=&state=#locale=ko
```

Metabase UI elements (like button labels) will be translated automatically - you don't need to add translations for them to your dictionary.

## Example translation dictionary

Metabase uses these dictionaries to translate user-generated content, like dashboard names in [static embeds](./static-embedding.md).

| Language | String      | Translation  |
| -------- | ----------- | ------------ |
| pt-BR    | Examples    | Exemplos     |
| pt-BR    | First tab   | Primeira aba |
| pt-BR    | Another tab | Outra aba    |
| pt-BR    | Title       | Título       |
| pt-BR    | Vendor      | Vendedor     |
| IT       | Examples    | Esempi       |

Prefer hyphens in your `pt-BR` in your translation dictionary. Underscores are also acceptable (if you download the dictionary _after_ uploading it, Metabase will transform `pt-BR` to `pt_BR`), but since the `locale` parameter in static embedding only accepts locales with hyphens (like `pt-BR`), we recommend using hyphens for consistency.

[See a list of supported locales](../configuring-metabase/localization.md#supported-languages).

## Use full phrases in translation dictionaries

Currently, Metabase doesn't tokenize strings for translations, so you should include exact phrases in your translation dictionary.

For example, if you have a dashboard called "Monthly Sales", it's not sufficient to have translations of "Monthly" and "Sales" - you also need to include "Monthly Sales" as a full string.

Exact translations also apply to strings that use punctuation and special characters. For example, if you have a question title "How many Widgets did we sell this week?", you must include that exact string (with "?") into the translation dictionary. Metabase would treat "How many Widgets did we sell this week" as a different string. Essentially, the strings are keys in a table Metabase looks up, so they must match exactly.

## Include markdown formatting in translation dictionaries

If the strings you want to translate include markdown formatting, you'll need to include the formatting in the dictionary. For example:

| Language | String         | Translation    |
| -------- | -------------- | -------------- |
| pt-BR    | `**Examples**` | `**Exemplos**` |
| pt-BR    | `_Examples_`   | `_Exemplos_`   |
| pt-BR    | `## Examples`  | `## Exemplos`  |

## Further reading

- [Static embedding](./static-embedding.md)
