---
title: Question component reference
summary: "Reference for the metabase-question web component attributes, the StaticQuestion and InteractiveQuestion SDK props, and the InteractiveQuestion layout components."
---

# Question component reference

Reference material for embedding a chart or a query editor: the attributes you can set on the `<metabase-question>` web component, the props you can pass to the SDK's `StaticQuestion` and `InteractiveQuestion` components, and the namespaced components you can use to build your own layout.

For how to set all this up, check out [Embed a chart](./chart.md) and [Embed the query builder](./query-builder.md).

## `metabase-question` web component attributes

These attributes apply to the `<metabase-question>` web component. For the SDK, see [`StaticQuestion` props](#staticquestion-props) and [`InteractiveQuestion` props](#interactivequestion-props).

{% include_file "{{ dirname }}/eajs/snippets/MetabaseQuestionAttributes.md" snippet="properties" %}

## `StaticQuestion` props

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`StaticQuestion` embeds a [view-only chart](./chart.md#embed-a-view-only-chart).

{% include_file "{{ dirname }}/sdk/api/snippets/StaticQuestionProps.md" snippet="properties" %}

## `InteractiveQuestion` props

{% include plans-blockquote.html feature="Interactive charts" convert_pro_link_to_embedding=true is_plural=true %}

`InteractiveQuestion` embeds an [interactive chart](./chart.md#embed-an-interactive-chart) or [a query editor](./query-builder.md).

{% include_file "{{ dirname }}/sdk/api/snippets/InteractiveQuestionProps.md" snippet="properties" %}

## Customize the layout of an interactive chart

By default, `InteractiveQuestion` comes with a layout that lets people view the question, apply filters and aggregations, and use the query builder:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/customize-interactive-question.tsx" snippet="example-default-interactive-question" %}
```

To build your own layout, use namespaced components inside `InteractiveQuestion` (like `<InteractiveQuestion.Filter />`):

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/customize-interactive-question.tsx" snippet="example-customized-interactive-question" %}
```

## `InteractiveQuestion` components

These components are available via the `InteractiveQuestion` namespace (like `<InteractiveQuestion.Filter />`). Use them to [customize the layout](#customize-the-layout-of-an-interactive-chart) of an interactive question.

- [InteractiveQuestion.AlertsButton](./sdk/api/InteractiveQuestion.html#alertsbutton)
- [InteractiveQuestion.Breakout](./sdk/api/InteractiveQuestion.html#breakout)
- [InteractiveQuestion.BreakoutDropdown](./sdk/api/InteractiveQuestion.html#breakoutdropdown)
- [InteractiveQuestion.ChartTypeDropdown](./sdk/api/InteractiveQuestion.html#charttypedropdown)
- [InteractiveQuestion.ChartTypeSelector](./sdk/api/InteractiveQuestion.html#charttypeselector)
- [InteractiveQuestion.DownloadWidget](./sdk/api/InteractiveQuestion.html#downloadwidget)
- [InteractiveQuestion.DownloadWidgetDropdown](./sdk/api/InteractiveQuestion.html#downloadwidgetdropdown)
- [InteractiveQuestion.Editor](./sdk/api/InteractiveQuestion.html#editor)
- [InteractiveQuestion.EditorButton](./sdk/api/InteractiveQuestion.html#editorbutton)
- [InteractiveQuestion.Filter](./sdk/api/InteractiveQuestion.html#filter)
- [InteractiveQuestion.FilterDropdown](./sdk/api/InteractiveQuestion.html#filterdropdown)
- [InteractiveQuestion.NavigationBackButton](./sdk/api/InteractiveQuestion.html#navigationbackbutton)
- [InteractiveQuestion.QuestionSettings](./sdk/api/InteractiveQuestion.html#questionsettings)
- [InteractiveQuestion.QuestionSettingsDropdown](./sdk/api/InteractiveQuestion.html#questionsettingsdropdown)
- [InteractiveQuestion.QuestionVisualization](./sdk/api/InteractiveQuestion.html#questionvisualization)
- [InteractiveQuestion.ResetButton](./sdk/api/InteractiveQuestion.html#resetbutton)
- [InteractiveQuestion.SaveButton](./sdk/api/InteractiveQuestion.html#savebutton)
- [InteractiveQuestion.SaveQuestionForm](./sdk/api/InteractiveQuestion.html#savequestionform)
- [InteractiveQuestion.SqlParametersList](./sdk/api/InteractiveQuestion.html#sqlparameterslist)
- [InteractiveQuestion.Summarize](./sdk/api/InteractiveQuestion.html#summarize)
- [InteractiveQuestion.SummarizeDropdown](./sdk/api/InteractiveQuestion.html#summarizedropdown)
- [InteractiveQuestion.Title](./sdk/api/InteractiveQuestion.html#title)
- [InteractiveQuestion.VisualizationButton](./sdk/api/InteractiveQuestion.html#visualizationbutton)

[InteractiveQuestion.BackButton](./sdk/api/InteractiveQuestion.html#backbutton) is deprecated. Use `InteractiveQuestion.NavigationBackButton` instead.

## Further reading

- [Embed a chart](./chart.md)
- [Embed the query builder](./query-builder.md)
- [Modular embedding components](./components.md)
- [Modular embedding parameters](./parameters.md)
- [Appearance](./appearance.md)
