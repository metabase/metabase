---
title: Translate embedded dashboards and questions
summary: Upload a translation dictionary to translate embedded dashboards and questions into different languages. Translate both Metabase content and data.
---

# Translate embedded dashboards and questions

You can upload a translation dictionary to translate strings both in Metabase content (like dashboard titles) and in the data itself (like column names and values).

The dictionary must be a CSV with these columns:

- Locale Code
- String
- Translation

> Don't put any sensitive data in the dictionary, since anyone can see the dictionary—including viewers of public links.

Uploading a new dictionary will replace the existing dictionary.

To remove a translation dictionary, upload a blank dictionary.

### Example translation dictionary

Metabase uses these dictionaries to translate user-generated content, like the names of dashboards.

| Language | String      | Translation  |
| -------- | ----------- | ------------ |
| pt_BR    | Examples    | Exemplos     |
| pt_BR    | First tab   | Primeira aba |
| pt_BR    | Another tab | Outra aba    |
| pt_BR    | Title       | Título       |
| pt_BR    | Vendor      | Vendedor     |

[See a list of supported locales](../configuring-metabase/localization.md#supported-languages)
