---
title: Modular embedding components
summary: Embed dashboards, questions, query builder, AI chat, and a collection browser.
---

# Modular embedding components

There are different components you can embed, each with various options.

> While you can use component parameters to show or hide parts of the embedded component, these parameters are _not_ a substitute for [permissions](../permissions/start.md). Even if you hide stuff, people could still grab their token from the frontend and use it to query the Metabase API.

This page covers what you can embed. For theming your embeds, see [Appearance](./appearance.md).

## Dashboard

To render a dashboard:

```html
<metabase-dashboard dashboard-id="1" with-title="true" with-downloads="false">
</metabase-dashboard>
```

### Required parameters

- `dashboard-id` - This can be a regular ID or an entity ID. [Using Entity IDs](../installation-and-operation/serialization.md#entity-ids-work-with-embedding) in your embeds ensures that the IDs stay stable when exporting from one Metabase and importing to another. Only for SSO. Guest embeds set the id with token.

### Optional parameters

- `with-title` (default is true) - show the dashboard title in the embed

{% include plans-blockquote.html feature="More parameters for dashboard component" convert_pro_link_to_embbedding=true is_plural=true%}

- `with-downloads` (default is true on OSS/Starter and false on Pro/Enterprise) - show the button to download the dashboard as PDF and download question results
- `drills` (default is true) - lets you drill through the dashboard
- `initial-parameters` - default value for dashboard filters, like `{ 'productId': '42' }`.
- `with-subscriptions` - let people set up [dashboard subscriptions](../dashboards/subscriptions.md). Unlike subscriptions sent from non-embedded dashboards, subscriptions sent from embedded dashboards exclude links to Metabase items, as Metabase assumes the recipient lacks access to the embedded Metabase.
- `refresh` - auto-refreshes the dashboard. `refresh="60"` will refresh the dashboard every 60 seconds.
- `hidden-parameters` - list of filter names to hide from the dashboard, like `['productId']`

For guest embeds, you can also set a `locale` in your page-level configuration to [translate embedded content](./translations.md).

Only `with-title` and `with-downloads` are supported in [guest embeds](./guest-embedding.md).

If you surround your attribute value with double quotes, make sure to use single quotes:

```html
<metabase-dashboard
  dashboard-id="1"
  initial-parameters="{ 'productId': '42' }"
></metabase-dashboard>
```

If you surround your attribute value with double quotes, make sure to use single quotes:

```html
<metabase-dashboard
  dashboard-id="1"
  hidden-parameters="['productId']"
></metabase-dashboard>
```

## Resizing dashboards to fit their content

The `<metabase-dashboard>` web component automatically resizes to fit its content. No additional configuration is needed.

## Question

To render a question (chart):

```html
<metabase-question question-id="1"></metabase-question>
```

### Required parameters

- `question-id` - This can be a regular ID or an entity ID. [Using Entity IDs](../installation-and-operation/serialization.md#entity-ids-work-with-embedding) in your embeds ensures that the IDs stay stable when exporting from one Metabase and importing to another. Only for SSO embeds. Guest embeds set the id with a token.

  Use `question-id="new"` to embed the query builder exploration interface.

### Optional parameters

- `with-title` (default is true) - show the title

{% include plans-blockquote.html feature="More parameters for dashboard component" convert_pro_link_to_embbedding=true is_plural=true%}

- `drills` (default is true) - lets you drill through the question
- `with-downloads` (default is true on OSS/Starter and false on Pro/Enterprise) - show downloads
- `initial-sql-parameters` - default value for SQL parameters, only applicable to native SQL questions, like `{ "productId": "42" }`
- `is-save-enabled` (default is false)
- `target-collection` - this is to enforce saving into a particular collection. Values: regular ID, entity ID, `"personal"`, `"root"`
- `with-alerts` (default is false) - let people set up [alerts](../questions/alerts.md) on embedded questions. Requires [email setup](../configuring-metabase/email.md). Unlike alerts on non-embedded questions, alerts on embedded questions only send to the logged-in user and exclude links to Metabase items. Not available for models.

Only `with-title` and `with-downloads` are supported in [guest embeds](./guest-embedding.md).

## Browser

{% include plans-blockquote.html feature="Browser component" convert_pro_link_to_embbedding=true%}

Browser component is only available for authenticated modular embeds. It's unavailable for [Guest embeds](./guest-embedding.md).

To render a collection browser so people can navigate a collection and open dashboards or questions:

```html
<metabase-browser
  initial-collection="14"
  read-only="false"
  collection-entity-types="['collection', 'dashboard']"
>
</metabase-browser>
```

### Required parameters

- `initial-collection` - This can be a collection ID or `root`. Use a collection ID (e.g., `14`) to start in a specific collection. Use `root` to start at the top-level, "Our Analytics" collection.

### Optional parameters

- `read-only` (default is true) – if true, people can interact with items (filter, summarize, drill-through) but can't save. If `false`, they can create and edit items in the collection.
- `collection-visible-columns` – an array of columns to show in the collection browser: `type`, `name`, `description`, `lastEditedBy`, `lastEditedAt`, `archive`. For example, `collection-visible-columns="['type', 'name']"` shows only the type and name columns.
- `collection-page-size` – how many items to show per page in the collection browser.
- `collection-entity-types` – an array of entity types to show in the collection browser: `collection`, `dashboard`, `question`, `model`. For example, `collection-entity-types="['collection', 'dashboard']"` shows only collections and dashboards.
- `data-picker-entity-types` – an array of entity types to show in the question's data picker: `model`, `table`. For example, `data-picker-entity-types="['model']"` shows only models.
- `with-new-question` (default is true) – whether to show the "New exploration" button.
- `with-new-dashboard` (default is true) – whether to show the "New dashboard" button. Only applies when `read-only` is false.

## AI chat

{% include plans-blockquote.html feature="AI chat component" convert_pro_link_to_embbedding=true%}

AI chat component is only available for authenticated modular embeds. It's unavailable for [Guest embeds](./guest-embedding.md).

To render the AI chat interface:

```html
<metabase-metabot></metabase-metabot>
```

### Required parameters

None.

### Optional parameters

- `layout` (default is `auto`) – how should the browser position the visualization with respect to the chat interface. Possible values are:
  - `auto` (default): Metabot uses the `stacked` layout on mobile screens, and a `sidebar` layout on larger screens.
  - `stacked`: the question visualization stacks on top of the chat interface.
  - `sidebar`: the question visualization appears to the left of the chat interface, which is in the right sidebar.

## Customizing loader and error components

{% include plans-blockquote.html feature="Customizing loader and error componentst" convert_pro_link_to_embbedding=true%}

If you're using the [modular embedding SDK](./sdk/introduction.md), you can provide your own components for loading and error states by specifying `loaderComponent` and `errorComponent` as props to `MetabaseProvider`.

```tsx
{% include_file "{{ dirname }}/sdk/snippets/appearance/customizing-loader-and-components.tsx" snippet="imports" %}

{% include_file "{{ dirname }}/sdk/snippets/appearance/customizing-loader-and-components.tsx" snippet="example" %}
```

## Further reading

- [Appearance](./appearance.md)
- [Modular embedding SDK](./sdk/introduction.md).
