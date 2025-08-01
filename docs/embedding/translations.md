---
title: Translate embedded dashboards and questions
summary: Upload a translation dictionary to translate questions and dashboards into different languages. Only available for static embeds.
---

# Translate embedded dashboards and questions

> For now, translations are only available for [static embeds](./static-embedding.md), not Interactive embedding or the Embedded analytics SDK.

You can upload a translation dictionary to translate strings both in Metabase content (like dashboard titles) and in the data itself (like column names and values).

The dictionary must be a CSV with these columns:

- Locale Code
- String
- Translation

> Don't put any sensitive data in the dictionary, since anyone can see the dictionary—including viewers of public links.

Uploading a new dictionary will replace the existing dictionary.

To remove a translation dictionary, upload a blank dictionary.

## Example translation dictionary

Metabase uses these dictionaries to translate user-generated content, like dashboard names in [static embeds](./static-embedding.md).

| Language | String      | Translation  |
| -------- | ----------- | ------------ |
| pt_BR    | Examples    | Exemplos     |
| pt_BR    | First tab   | Primeira aba |
| pt_BR    | Another tab | Outra aba    |
| pt_BR    | Title       | Título       |
| pt_BR    | Vendor      | Vendedor     |

[See a list of supported locales](../configuring-metabase/localization.md#supported-languages)

## Further reading

- [Static embedding](./static-embedding.md)
