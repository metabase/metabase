---
title: Embed a collection browser
summary: "Embed a browsable collection so people can find and open dashboards and questions from your app, with a web component or using the React SDK."
redirect_from:
  - /docs/latest/embedding/sdk/collections
---

# Embed a collection browser

{% include plans-blockquote.html feature="Browser component" convert_pro_link_to_embedding=true%}

![Collection browser embedded with the metabase-browser web component](./images/embedded-collection-browser.png)

The collection browser lets people navigate through collections they have permission to view.

There are two ways to embed a collection browser:

- [Web component](#web-component-collection-browser): a browser with breadcrumbs, navigation, and buttons for creating new content, all built for you.
- [React SDK](#react-sdk-collection-browser): a list of collection items that you wire into your own app.

People need to be signed in to your Metabase to view the collection browser, because the browser shows them what their [collection permissions](../permissions/collections.md) allow and nothing else. That means [SSO](./introduction.md#components-with-sso-authentication) only; a collection browser won't work in a [guest embed](./guest-embedding.md).

## Web component collection browser

Point `<metabase-browser>` at the collection you want people to start in:

```html
<metabase-browser initial-collection="123"></metabase-browser>
```

`initial-collection` is the only required attribute. It takes:

- A collection ID, like `123` — the number in the collection's URL. On Pro and Enterprise plans, you can use the collection's [entity ID](../installation-and-operation/serialization.md#entity-ids-work-with-embedding) instead, which stays the same when you [serialize](../installation-and-operation/serialization.md) content from one Metabase to another.
- `"root"` for the top-level **Our analytics** collection.
- `"personal"` for the personal collection of whoever's viewing.
- `"tenant"` for the [tenant](./tenants.md) collection of whoever's viewing. People who aren't tenant members will get an error.

For the full list of attributes, see [web component attributes](./browser-reference.md#web-component-metabase-browser-attributes).

### Let people save changes

`read-only` controls how much people can do with the content they open, and it defaults to `true`. People can filter, summarize, and drill through everything they open, but they can't save any of it. Set `read-only="false"` and they can edit _and_ save dashboards and questions.

```html
<metabase-browser initial-collection="123" read-only="false"></metabase-browser>
```

Under the hood, the `read-only` attribute decides which dashboard component people land on: a read-only browser opens dashboards for exploring, while `read-only="false"` opens them for [editing](./dashboard.md#web-component-editable-dashboard).

There's no attribute for pinning the save target to a fixed collection. (In the SDK, the question components take a `targetCollection` prop that pre-selects a collection and hides the picker. See [Let people save their changes](./chart.md#let-people-save-their-changes).) What people can save to comes down to [collection permissions](../permissions/collections.md). Everyone can always write to their own personal collection, so that shows up as an option even if you've not given people [curate access](../permissions/collections.md#curate-access) to any collection.

### Add new question and new dashboard buttons

The web component browser comes with a **New question** button. Set `read-only="false"` and people also get a **New dashboard** button. Metabase shows or hides either button based on whether the person can write to the collection you named in `initial-collection`.

Both buttons are on by default, so turn either one off with `with-new-question` or `with-new-dashboard`. Here, only the new question button shows:

```html
<metabase-browser
  initial-collection="123"
  read-only="false"
  with-new-question="true"
  with-new-dashboard="false"
></metabase-browser>
```

**New question** ignores `read-only` entirely, so on a read-only browser people can still open the query builder and explore, but they won't be able to save a new question, or overwrite an existing question. The new question button also opens the query builder with every table, model, and saved question people have access to. To narrow down the list of entity types people can choose, list the entity types you want in `data-picker-entity-types`. Limiting people to [models](../data-modeling/models.md), for example, means they build on your curated data rather than on raw tables:

```html
<metabase-browser
  initial-collection="123"
  read-only="false"
  data-picker-entity-types="['model']"
></metabase-browser>
```

If the buttons don't appear, check that the people using the embed have [curate access](../permissions/collections.md#curate-access) to the starting collection.

### Let people follow links to other dashboards and questions

By default, clicking a link (like from a [link card](../dashboards/introduction.md#link-cards)) from inside a dashboard does nothing, so people stay inside the collection you gave them. Turn on `enable-entity-navigation` to let them follow those links:

```html
<metabase-browser
  initial-collection="123"
  enable-entity-navigation="true"
></metabase-browser>
```

People can still only open content their collection permissions allow.

## React SDK collection browser

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

The SDK's `CollectionBrowser` lists what's in a collection and tells you when someone clicks an item. It has no create buttons and doesn't open anything on its own. You decide what a click does, and add whatever buttons you want. `CollectionBrowser` does render its own breadcrumbs, though, so people can navigate into subcollections and back out again.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/collections/collection-browser.tsx" %}
```

`collectionId` takes the same values as `initial-collection`: a collection ID (sequential or entity), or one of `"root"`, `"personal"`, or `"tenant"`. It defaults to `"personal"`, so unless you want people to start in their own personal collection, you should pass an explicit value.

For the full list of props, see [`CollectionBrowser` props](./browser-reference.md#react-sdk-collectionbrowser-props).

### Decide what happens when someone clicks an item

Use `onClick` to render a Metabase component, route somewhere in your app, or open a modal.

`onClick` hands you the `item` that was clicked. Check `item.model` to find out what was clicked. Here, `card` is a question, and `dataset` is a model.

One quirk: when someone clicks on a collection, `CollectionBrowser` navigates into that collection _and_ calls `onClick`. So skip `"collection"` in your handler, or you'll move people twice.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/collections/collection-browser-click.tsx" %}
```

## Further reading

- [Browser component reference](./browser-reference.md)
- [Embed a dashboard](./dashboard.md)
- [Embed a chart](./chart.md)
- [Embed the query builder](./query-builder.md)
- [Appearance](./appearance.md)
- [Collections](../exploration-and-organization/collections.md)
- [Collection permissions](../permissions/collections.md)
- [Authentication](./authentication.md)
- [Modular embedding SDK](./sdk/introduction.md)
