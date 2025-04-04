---
title: "Embedded analytics SDK - questions"
description: How to embed charts in your app with the Embedded analytics SDK.
---

# Embedded analytics SDK - questions

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

There are different ways you can embed questions:

- [Static question](#embedding-a-static-question). Embeds a chart. Clicking on the chart doesn't do anything.
- [Interactive question](#embedding-an-interactive-question). Clicking on the chart gives you the drill-through menu.
- [Query builder](#embedding-the-query-builder-for-creating-new-questions). Embeds the graphical query builder without a pre-defined query.

## Embedding a static question

You can embed a static question using the `StaticQuestion` component.

Docs: [StaticQuestion](./generated/html/StaticQuestion.html)

![Static question](../images/static-question.png)

The component has a default height, which can be customized by using the `height` prop. To inherit the height from the parent container, you can pass `100%` to the height prop.

```typescript
{% include_file "{{ dirname }}/snippets/questions/static-question.tsx" %}
```

## Embedding an interactive question

You can embed an interactive question using the `InteractiveQuestion` component.

Docs: [InteractiveQuestion](./generated/html/InteractiveQuestion.html)

![Interactive question](../images/interactive-question.png)

```typescript
{% include_file "{{ dirname }}/snippets/questions/interactive-question.tsx" %}
```

## Pass SQL parameters to SQL questions with `initialSqlParameters`

You can pass parameter values to questions defined with SQL via the `initialSqlParameters` prop, in the format of `{parameter_name: parameter_value}`. Learn more about [SQL parameters](../../questions/native-editor/sql-parameters.md).

```typescript
{% include_file "{{ dirname }}/snippets/questions/initial-sql-parameters.tsx" snippet="example" %}
```

`initialSqlParameters` can't be used with questions built using the query builder.

## Customizing interactive questions

By default, the Embedded analytics SDK provides a default layout for interactive questions that allows you to view your questions, apply filters and aggregations, and access functionality within the query builder.

Here's an example of using the `InteractiveQuestion` component with its default layout:

```typescript
{% include_file "{{ dirname }}/snippets/questions/customize-interactive-question.tsx" snippet="example-default-interactive-question" %}
```

To customize the layout, use namespaced components within the `InteractiveQuestion` component. For example:

```typescript
{% include_file "{{ dirname }}/snippets/questions/customize-interactive-question.tsx" snippet="example-customized-interactive-question" %}
```

## Interactive question components

These components are available via the `InteractiveQuestion` namespace (e.g., `<InteractiveQuestion.Filter />`).

Docs:
- [InteractiveQuestion.BackButton](./generated/html/InteractiveQuestion.html#backbutton)
- [InteractiveQuestion.Breakout](./generated/html/InteractiveQuestion.html#breakout)
- [InteractiveQuestion.BreakoutDropdown](./generated/html/InteractiveQuestion.html#breakoutdropdown)
- [InteractiveQuestion.ChartTypeDropdown](./generated/html/InteractiveQuestion.html#charttypedropdown)
- [InteractiveQuestion.ChartTypeSelector](./generated/html/InteractiveQuestion.html#charttypeselector)
- [InteractiveQuestion.Editor](./generated/html/InteractiveQuestion.html#editor)
- [InteractiveQuestion.EditorButton](./generated/html/InteractiveQuestion.html#editorbutton)
- [InteractiveQuestion.Filter](./generated/html/InteractiveQuestion.html#filter)
- [InteractiveQuestion.FilterDropdown](./generated/html/InteractiveQuestion.html#filterdropdown)
- [InteractiveQuestion.QuestionSettings](./generated/html/InteractiveQuestion.html#questionsettings)
- [InteractiveQuestion.QuestionSettingsDropdown](./generated/html/InteractiveQuestion.html#questionsettingsdropdown)
- [InteractiveQuestion.QuestionVisualization](./generated/html/InteractiveQuestion.html#questionvisualization)
- [InteractiveQuestion.ResetButton](./generated/html/InteractiveQuestion.html#resetbutton)
- [InteractiveQuestion.SaveButton](./generated/html/InteractiveQuestion.html#savebutton)
- [InteractiveQuestion.SaveQuestionForm](./generated/html/InteractiveQuestion.html#savequestionform)
- [InteractiveQuestion.Summarize](./generated/html/InteractiveQuestion.html#summarize)
- [InteractiveQuestion.SummarizeDropdown](./generated/html/InteractiveQuestion.html#summarizedropdown)
- [InteractiveQuestion.DownloadWidget](./generated/html/InteractiveQuestion.html#downloadwidget)
- [InteractiveQuestion.DownloadWidgetDropdown](./generated/html/InteractiveQuestion.html#downloadwidgetdropdown)
- [InteractiveQuestion.Title](./generated/html/InteractiveQuestion.html#title)

## Interactive question plugins

You can use [plugins](./plugins.md) to add custom functionality to your questions.

### `mapQuestionClickActions`

This plugin allows you to add custom actions to the click-through menu of an interactive question. You can add and
customize the appearance and behavior of the custom actions.

```typescript
{% include_file "{{ dirname }}/snippets/questions/interactive-question-plugins.tsx" snippet="example" %}
```

## Prevent people from saving changes to an `InteractiveQuestion`

To prevent people from saving changes to an interactive question, or from saving changes as a new question, you can set `isSaveEnabled={false}`:

```tsx
{% include_file "{{ dirname }}/snippets/questions/disable-question-save.tsx" %}
```

## Embedding the query builder for creating new questions

![Query builder](../images/query-builder.png)

You can embed the query builder for creating new questions by passing the `questionId="new"` prop to the `InteractiveQuestion` component. You can use the [`children` prop](#customizing-interactive-questions) to customize the layout for creating new questions.

```tsx
{% include_file "{{ dirname }}/snippets/questions/new-question.tsx" %}
```

To customize the question editor's layout, use the `InteractiveQuestion` component [directly with a custom `children` prop](#customizing-interactive-questions).
