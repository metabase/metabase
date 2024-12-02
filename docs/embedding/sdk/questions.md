---
title: "Embedded analytics SDK - components"
---

# Embedded analytics SDK - questions

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

There are different ways you can embed questions:

- [Static question](#embedding-a-static-question). Embeds a chart. Clicking on the chart doesn't do anything.
- [Interactive question](#embedding-an-interactive-question). Clicking on the chart gives you the drill-through menu.
- [Query builder](#embedding-the-query-builder). Embeds the graphical query builder without a pre-defined query.

## Embedding a static question

You can embed a static question using the `StaticQuestion` component.

The component has a default height, which can be customized by using the `height` prop. To inherit the height from the parent container, you can pass `100%` to the height prop.

```typescript
import React from "react";
import {MetabaseProvider, StaticQuestion} from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
    const questionId = 1; // This is the question ID you want to embed

    return (
        <MetabaseProvider config={config}>
            <StaticQuestion questionId={questionId} showVisualizationSelector={false}/>
        </MetabaseProvider>
    );
}
```

You can pass parameter values to questions defined with SQL via `parameterValues` prop, in the format of `{parameter_name: parameter_value}`. Learn more about [SQL parameters](../../questions/native-editor/sql-parameters.md).

```jsx
{% raw %}
<StaticQuestion questionId={questionId} parameterValues={{ product_id: 50 }} />
{% endraw %}
```

## Embedding an interactive question

You can embed an interactive question using the `InteractiveQuestion` component.

```typescript
import React from "react";
import {MetabaseProvider, InteractiveQuestion} from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
    const questionId = 1; // This is the question ID you want to embed

    return (
        <MetabaseProvider config={config}>
            <InteractiveQuestion questionId={questionId}/>
        </MetabaseProvider>
    );
}
```

## Question props

| Prop                  | Type                                                                 | Description                                                                                                                                                                                                                                                                                                        |
|-----------------------|----------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| questionId            | number or string                                                     | (required) The ID of the question. This is either:<br>- The numerical ID when accessing a question link, e.g., `http://localhost:3000/question/1-my-question` where the ID is `1`.<br>- The `entity_id` key of the question object. You can find a question's entity ID in the info panel when viewing a question. |
| plugins               | `{ mapQuestionClickActions: Function }` or null                      | Additional mapper function to override or add drill-down menu.                                                                                                                                                                                                                                                     |
| height                | number or string                                                     | (optional) A number or string specifying a CSS size value that specifies the height of the component                                                                                                                                                                                                               |
| entityTypeFilter      | string array; options include "table", "question", "model", "metric" | (optional) An array that specifies which entity types are available in the data picker                                                                                                                                                                                                                             |
| isSaveEnabled         | boolean                                                              | (optional) Whether people can save the question.                                                                                                                                                                                                                                                                   |
| withResetButton       | boolean                                                              | (optional, default: `true`) Determines whether a reset button is displayed. Only relevant when using the default layout                                                                                                                                                                                            |
| withTitle             | boolean                                                              | (optional, default: `false`) Determines whether the question title is displayed. Only relevant when using the default layout.                                                                                                                                                                                      |
| customTitle           | string or undefined                                                  | (optional) Allows a custom title to be displayed instead of the default question title. Only relevant when using the default layout.                                                                                                                                                                               |
| withChartTypeSelector | boolean                                                              | (optional, default: `true`) Determines whether the chart type selector is shown. Only relevant when using the default layout.                                                                                                                                                                                      |
| onBeforeSave          | `() => void`                                                         | (optional) A callback function that triggers before saving. Only relevant when `isSaveEnabled = true`.                                                                                                                                                                                                             |
| onSave                | `() => void`                                                         | (optional) A callback function that triggers when a user saves the question. Only relevant when `isSaveEnabled = true`.                                                                                                                                                                                            |
| saveToCollectionId    | number                                                               | (optional) The target collection to save the question to. This will hide the collection picker from the save modal. Only applicable to static questions.                                                                                                                                                           |

## Customizing interactive questions

By default, the Embedded analytics SDK provides a default layout for interactive questions that allows you to view your questions, apply filters and aggregations, and access functionality within the query builder.

Here's an example of using the `InteractiveQuestion` component with its default layout:

```typescript
<InteractiveQuestion questionId={95} />
```

To customize the layout, use namespaced components within the `InteractiveQuestion` component. For example:

```typescript
{% raw %}
<InteractiveQuestion questionId={95}>
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div style={{ display: "grid", placeItems: "center" }}>
      <InteractiveQuestion.Title />
      <InteractiveQuestion.ResetButton />
    </div>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "100%" }}>
        <InteractiveQuestion.QuestionVisualization />
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "scroll" }}>
        <InteractiveQuestion.Summarize />
      </div>
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}>
      <InteractiveQuestion.Filter />
    </div>
  </div>
</InteractiveQuestion>
{% endraw %}
```

## Interactive question components

These components are available via the `InteractiveQuestion` namespace (e.g., `<InteractiveQuestion.Filter />`).

| Component               | Info                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `BackButton`            | The back button, which provides `back` functionality for the InteractiveDashboard                                            |
| `FilterBar`             | The row of badges that contains the current filters that are applied to the question                                         |
| `Filter`                | The Filter pane containing all possible filters                                                                              |
| `FilterPicker`          | Picker for adding a new filter to the question                                                                               |
| `FilterButton`          | The button used in the default layout to open the Filter pane. You can replace this button with your own implementation.     |
| `ResetButton`           | The button used to reset the question after the question has been modified with filters/aggregations/etc                     |
| `Title`                 | The question's title                                                                                                         |
| `SaveButton`            | Button for saving the question.                                                                                              |
| `Summarize`             | The Summarize pane containing all possible aggregations                                                                      |
| `SummarizeButton`       | The button used in the default layout to open the Summarize pane. You can replace this button with your own implementation.  |
| `Notebook`              | The Notebook editor that allows for more filter, aggregation, and custom steps                                               |
| `NotebookButton`        | The button used in the default layout to open the Notebook editor. You can replace this button with your own implementation. |
| `QuestionVisualization` | The chart visualization for the question                                                                                     |
| `QuestionSettings`      | The settings for the current visualization                                                                                   |

## Interactive question plugins

You can use plugins to add custom functionality to your questions.

### `mapQuestionClickActions`

This plugin allows you to add custom actions to the click-through menu of an interactive question. You can add and
customize the appearance and behavior of the custom actions.

```typescript
// You can provide a custom action with your own `onClick` logic.
const createCustomAction = clicked => ({
  buttonType: "horizontal",
  name: "client-custom-action",
  section: "custom",
  type: "custom",
  icon: "chevronright",
  title: "Hello from the click app!!!",
  onClick: ({ closePopover }) => {
    alert(`Clicked ${clicked.column?.name}: ${clicked.value}`);
    closePopover();
  },
});

// Or customize the appearance of the custom action to suit your need.
const createCustomActionWithView = clicked => ({
  name: "client-custom-action-2",
  section: "custom",
  type: "custom",
  view: ({ closePopover }) => (
    <button
      className="tw-text-base tw-text-yellow-900 tw-bg-slate-400 tw-rounded-lg"
      onClick={() => {
        alert(`Clicked ${clicked.column?.name}: ${clicked.value}`);
        closePopover();
      }}
    >
      Custom element
    </button>
  ),
});

const plugins = {
  /**
   * You will have access to default `clickActions` that Metabase renders by default.
   * So you could decide if you want to add custom actions, remove certain actions, etc.
   */
  mapQuestionClickActions: (clickActions, clicked) => {
    return [
      ...clickActions,
      createCustomAction(clicked),
      createCustomActionWithView(clicked),
    ];
  },
};

const questionId = 1; // This is the question ID you want to embed

return (
  <MetabaseProvider config={config} pluginsConfig={plugins}>
    <InteractiveQuestion questionId={questionId} />
  </MetabaseProvider>
);
```

## Embedding an editable interactive question

You can edit an existing question using the query builder by passing the `isSaveEnabled` prop on the `InteractiveQuestion` component.

```tsx
import React from "react";
import {MetabaseProvider, InteractiveQuestion} from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
    return (
        <MetabaseProvider config={config}>
            <InteractiveQuestion questionId={1} isSaveEnabled />
        </MetabaseProvider>
    );
}
```

## Embedding the query builder

With the `CreateQuestion` component, you can embed the query builder without a pre-defined question.

This component is built on top of the `InteractiveQuestion` component with [namespaced components](#interactive-question-components). It [shares the same props as InteractiveQuestion](#question-props), except it lacks the `questionId` prop and the ability to pass custom children.

To customize the question editor's layout, use the `InteractiveQuestion` component [directly with a custom `children` prop](#customizing-interactive-questions).

```tsx
import React from "react";
import {MetabaseProvider, CreateQuestion} from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
    return (
        <MetabaseProvider config={config}>
            <CreateQuestion />
        </MetabaseProvider>
    );
}
```
