---
title: Embed a collection browser
summary: "Embed a browsable collection so people can find and open dashboards and questions from your app, with a web component or using the React SDK."
redirect_from:
  - /docs/latest/embedding/sdk/collections
---

# Embed a collection browser

![Embedded collection browser](./images/embedded-collection-browser.png)

There are two ways to embed a collection browser:

- [Web component](#web-component-collection-browser): a browser with breadcrumbs, navigation, and buttons for creating new content, all built for you.
- [React SDK](#react-sdk-collection-browser): a list of collection items that you wire into your own app.

People need to be signed in to your Metabase to view the collection browser, because the browser shows them what their [collection permissions](../permissions/collections.md) allow and nothing else. That means [SSO](./introduction.md#sso-embeds) only; a collection browser won't work in a [guest embed](./guest-embedding.md).

## Web component collection browser

{% include plans-blockquote.html feature="Browser component" convert_pro_link_to_embedding=true%}

Point `<metabase-browser>` at the collection you want people to start in:

```html
<metabase-browser
  initial-collection="14"
  read-only="false"
  collection-entity-types="['collection', 'dashboard']"
></metabase-browser>
```

`initial-collection` is the only required attribute. Pass a collection ID, or `"root"` for the top-level **Our analytics** collection.

For the full list of attributes, see [web component attributes](./browser-reference.md#web-component-metabase-browser-attributes).

### Let people save changes

`read-only` controls how much people can do with the content they open, and it defaults to `true`. Leave it alone and people can filter, summarize, and drill through everything they open, but they can't save any of it. Set `read-only="false"` and they can edit and save dashboards and questions.

```html
<metabase-browser initial-collection="14" read-only="false"></metabase-browser>
```

Read-only also decides which dashboard component people land on: a read-only browser opens dashboards for exploring, while `read-only="false"` opens them for [editing](./dashboard.md#let-people-edit-dashboards).

### Add new question and new dashboard buttons

The web component browser comes with **New question** and **New dashboard** buttons, both on by default. Turn either one off with `with-new-question` or `with-new-dashboard`. Here we just show the new question button:

```html
<metabase-browser
  initial-collection="14"
  read-only="false"
  with-new-question="true"
  with-new-dashboard="false"
></metabase-browser>
```

**New dashboard** only shows up when `read-only` is `false`.

**New question** ignores `read-only` entirely, so on a read-only browser people can still open the query builder and explore, but they won't be able to save a new question, or overwrite an existing question.

Metabase will show or hide the buttons based on whether the person can write to the collection you named in `initial-collection`.

If the buttons don't appear, check that the people using the embed have [curate access](../permissions/collections.md#curate-access) to the starting collection.

### Let people follow links to other dashboards and questions

By default, clicking a link from inside an opened dashboard or question does nothing, so people stay inside the collection you gave them. Turn on `enable-entity-navigation` to let them follow those links:

```html
<metabase-browser
  initial-collection="14"
  enable-entity-navigation="true"
></metabase-browser>
```

They can still only open content their collection permissions allow.

## React SDK collection browser

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

The SDK's `CollectionBrowser` lists what's in a collection and tells you when someone clicks an item. It has no create buttons and doesn't open anything on its own. You decide what a click does. `CollectionBrowser` does render its own breadcrumbs, so people can navigate into subcollections and back out again.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/collections/collection-browser.tsx" %}
```

`collectionId` takes a collection ID, or one of `"personal"`, `"tenant"`, or `"root"`. It defaults to `"personal"`, so pass something explicit unless you want people to start in their own personal collection.

For the full list of props, see [`CollectionBrowser` props](./browser-reference.md#react-sdk-collectionbrowser-props).

### Decide what happens when someone clicks an item

`onClick` hands you the item that was clicked, and it's up to you what to do with it. You can render a Metabase component, route somewhere in your app, or open a modal.

Check `item.model` to find out what was clicked. Two of its values don't match what people see in the UI: a question is a `card`, and a model is a `dataset`.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/collections/collection-browser-click.tsx" %}
```

## Where people save what they create

In the web component browser, saving follows navigation: whatever collection someone is looking at when they save a question is where that question lands. There's no attribute for pinning the save target to a fixed collection---if you need that, embed a [question](./chart.md#let-people-save-their-changes) or the [query builder](./query-builder.md#let-people-save-questions) with `target-collection` instead of a browser.

Whether people can save at all comes down to `read-only`, and what they can save to comes down to [collection permissions](../permissions/collections.md). Everyone can always write to their own personal collection, so that shows up as an option even if you've granted no other [curate access](../permissions/collections.md#curate-access).

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
