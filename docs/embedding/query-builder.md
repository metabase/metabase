---
title: Embed the query builder
summary: "Embed Metabase's visual query builder or SQL editor in your app, so people can build and save their own questions."
---

# Embed the query builder

{% include plans-blockquote.html feature="Embedding the query builder" convert_pro_link_to_embedding=true %}

Instead of embedding a saved chart, you can embed one of Metabase's editors so people can build questions from scratch.

- [Visual query builder](#embed-the-visual-query-builder)
- [SQL editor](#embed-the-sql-editor)

Both editors need an [SSO embed](./modular-embedding.md), which you can set up with web components or the [React SDK](./sdk/introduction.md). Guest embeds can't include either editor: to run a new query, Metabase has to know who's asking, so it can work out which data they're allowed to see.

To embed an existing chart instead, check out [Embed a chart](./question.md).

## Embed the visual query builder

To let people build new questions with the visual query builder, use `new` as the question ID.

![Query builder](./images/query-builder.png)

As a web component:

```html
<metabase-question question-id="new"></metabase-question>
```

With the SDK:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/questions/new-question.tsx" %}
```

To narrow down what people can start from, list the entity types you want in the data picker with the `entity-types` attribute (web component) or the `entityTypes` prop (SDK). For example, `entity-types="['model']"` limits the picker to [models](../data-modeling/models.md).

## Embed the SQL editor

To let people write native SQL, use `new-native` as the question ID.

As a web component:

```html
<metabase-question question-id="new-native"></metabase-question>
```

With the SDK:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/questions/new-native-question.tsx" %}
```

Everyone still queries through their own Metabase account, so people can only run SQL against databases their groups have permission to query. See [data permissions](../permissions/data.md).

## Let people save what they build

Saving works the opposite way in each setup: it's off by default in web components, and on by default in the SDK.

With a web component, turn saving on with `is-save-enabled="true"`, and set the collection that new questions land in with `target-collection`:

```html
<metabase-question
  question-id="new"
  is-save-enabled="true"
  target-collection="5"
></metabase-question>
```

With the SDK, saving is already on, so `targetCollection` is all you need. Setting `targetCollection` also hides the collection picker, so nobody has to decide where their question goes.

For the `isSaveEnabled`, `onBeforeSave`, and `onSave` props, check out [Let people save their changes](./question.md#let-people-save-their-changes).

## Customize the query builder's layout

With the SDK, you can build your own layout out of the namespaced components inside `InteractiveQuestion`, like `<InteractiveQuestion.Editor />`. See [InteractiveQuestion components](./question.md#interactivequestion-components).

## Further reading

- [Embed a chart](./question.md)
- [Modular embedding](./modular-embedding.md)
- [Modular embedding SDK](./sdk/introduction.md)
- [Modular embedding components](./components.md)
- [Appearance](./appearance.md)
