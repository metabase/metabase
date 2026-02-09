---
title: Translate embedded components
summary: Upload a translation dictionary to translate the UI and content of embedded components like questions and dashboards into different languages.
---

# Translate embedded components

{% include plans-blockquote.html feature="Translation of embedded content" convert_pro_link_to_embbedding=true %}

You can set a locale on modular embeds (guest, SSO, and SDK) to translate Metabase's UI. If you've uploaded a translation dictionary, Metabase will also translate content strings (like dashboard names and filter labels) for all [modular embeds](./modular-embedding.md).

## Set a locale to translate UI, and upload a dictionary to translate content

To translate an embed's user interface, set the locale in the config. The `locale` setting works for all modular embeds (guest, SSO, and SDK). Metabase UI elements (like menus) will be translated automatically - you don't need to add translations for them to your dictionary.

For guest and SSO embeds (not the SDK), set the `locale` in `window.metabaseConfig`:

```html
<script>
  window.metabaseConfig = {
    isGuest: true,
    instanceUrl: "YOUR_METABASE_URL",
    // Translates UI elements to the locale's language.
    // If you've uploaded a translation dictionary,
    // Metabase will also translate content strings
    // to this locale from that dictionary.
    locale: "es"
  };
</script>

<metabase-dashboard token="YOUR_JWT_TOKEN"></metabase-dashboard>
```

If you also want to translate content (like item titles, headings, filter labels, or data), you'll need to add a translation dictionary.

### SDK translations

For the SDK, set the `locale` prop on the `MetabaseProvider` component:

```tsx
<MetabaseProvider
  authConfig={authConfig}
  locale="es"
>
</MetabaseProvider>
```

If you've uploaded a translation dictionary, the SDK will also translate content strings (like dashboard names and filter labels) to this locale from that dictionary.

## Add a translation dictionary

The dictionary must be a CSV with these columns:

- **Language** with the locale code
- **String** with the string to be translated
- **Translation**

> Don't put any sensitive data in the dictionary, since anyone can see the dictionary—including viewers of public links.

To add a translation dictionary:

1. Go to **Admin settings > Embedding**.
2. Under **Translate embedded dashboards and question**, click **Upload translation dictionary**.

Uploading a new dictionary will replace the existing dictionary.

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

Prefer hyphens in your `pt-BR` in your translation dictionary. Underscores are also acceptable (if you download the dictionary _after_ uploading it, Metabase will transform `pt-BR` to `pt_BR`), but since the `locale` parameter in modular embeds only accepts locales with hyphens (like `pt-BR`), we recommend using hyphens for consistency.

[See a list of supported locales](../configuring-metabase/localization.md#supported-languages).

## Use full phrases in translation dictionaries

Currently, Metabase doesn't tokenize strings for translations, so you should include exact phrases in your translation dictionary.

For example, if you have a dashboard called "Monthly Sales", it's not sufficient to have translations of "Monthly" and "Sales" - you also need to include "Monthly Sales" as a full string.

Exact translations also apply to strings that use punctuation and special characters. For example, if you have a question title "How many Widgets did we sell this week?", you must include that exact string (with "?") into the translation dictionary. Metabase would treat "How many Widgets did we sell this week" as a different string. Essentially, the strings are keys in a table Metabase looks up, so they must match exactly.

## Translations are case-insensitive

Translations are case-insensitive. For example, if your translation dictionary has a translation:

| Language | String   | Translation |
| -------- | -------- | ----------- |
| pt-BR    | Examples | Exemplos    |

`Examples`, `examples`, `EXAMPLES` would all be translated as `Exemplos`. That is, Metabase won't preserve the original case; it will output the exact translation string in the dictionary.

## Include markdown formatting in translation dictionaries

If the strings you want to translate include markdown formatting, you'll need to include the formatting in the dictionary. For example:

| Language | String         | Translation    |
| -------- | -------------- | -------------- |
| pt-BR    | `**Examples**` | `**Exemplos**` |
| pt-BR    | `_Examples_`   | `_Exemplos_`   |
| pt-BR    | `## Examples`  | `## Exemplos`  |


## The AI chat component isn't translated

One exception is that Metabase won't translate the text in the [AI chat component](./sdk/ai-chat.md). While Metabot can understand other languages, it works best in English.

## Further reading

- [Modular embedding](./modular-embedding.md)
- [Guest embedding](./guest-embedding.md)
