---
title: "Embedded analytics SDK - components"
---

# Embedded analytics SDK - questions

- [Interactive questions](#embedding-an-interactive-question)
- [Static questions](#embedding-a-static-question)
- [Creating a question](#creating-a-question)
- [Editing a question](#editing-a-question)

## Embedding an interactive question

You can embed a static question using the `InteractiveQuestion` component.

```typescript jsx
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
const questionId = 1; // This is the question ID you want to embed
```

## Question props

- **questionId**: `number | string` (required) – The ID of the question. This is either:
  - The numerical ID when accessing a question link, e.g., `http://localhost:3000/question/1-my-question` where the ID is `1`.
  - The `entity_id` key of the question object. You can find a question's entity ID in the info panel when viewing a question.
- **plugins**: `{ mapQuestionClickActions: Function } | null` – Additional mapper function to override or add
  drill-down menu.
- **height**: `number | string` (optional) – A number or string specifying a CSS size value that specifies the height of the component
- **entityTypeFilter**: `("table" | "question" | "model" | "metric")[]` (optional) – An array that specifies which entity types are available in the data picker
- **isSaveEnabled**: `boolean` (optional) – whether people can save the question.

### Additional props when using the default layout

These props are only used when using the default layout.

- **withResetButton**: `boolean` (optional, default: `true`) – Determines whether a reset button is displayed.
- **withTitle**: `boolean` (optional, default: `false`) – Determines whether the question title is displayed.
- **customTitle**: `string | undefined` (optional) – Allows a custom title to be displayed instead of the default question title.

Only relevant when `isSaveEnabled = true`:

- **onBeforeSave**: `() => void` (optional) – A callback function that triggers before saving.
- **onSave**: `() => void` (optional) – A callback function that triggers when a user saves the question

## Customizing Interactive Questions

By default, the Embedded Analytics SDK provides a default layout for interactive questions that allows you to view your questions, apply filters and aggregations, and access functionality within the query builder.

Using the `InteractiveQuestion` with its default layout looks like this:

```typescript jsx
<InteractiveQuestion questionId={95} />
```

To customize the layout, use namespaced components within the `InteractiveQuestion`. For example:

```typescript jsx
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
```

## Interactive question components

These components are available via the `InteractiveQuestion` namespace (e.g., `<InteractiveQuestion.Filter />`)

| Component               | Info                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `BackButton`            | The back button, which provides `back` functionality for the InteractiveDashboard                                            |
| `FilterBar`             | The row of badges that contains the current filters that are applied to the question                                         |
| `Filter`                | The Filter pane containing all possible filters                                                                              |
| `FilterButton`          | The button used in the default layout to open the Filter pane. You can replace this button with your own implementation.     |
| `ResetButton`           | The button used to reset the question after the question has been modified with filters/aggregations/etc                     |
| `Title`                 | The question's title                                                                                                         |
| `Summarize`             | The Summarize pane containing all possible aggregations                                                                      |
| `SummarizeButton`       | The button used in the default layout to open the Summarize pane. You can replace this button with your own implementation.  |
| `Notebook`              | The Notebook editor that allows for more filter, aggregation, and custom steps                                               |
| `NotebookButton`        | The button used in the default layout to open the Notebook editor. You can replace this button with your own implementation. |
| `QuestionVisualization` | The chart visualization for the question                                                                                     |

## Embedding a static question

You can embed a static question using the `StaticQuestion` component.

The component has a default height, which can be customized by using the `height` prop. To inherit the height from the parent container, you can pass `100%` to the height prop.

## Static embed props

- **questionId**: `number | string` (required) – The ID of the question. This is either:
  - The numerical ID when accessing a question link, e.g., `http://localhost:3000/question/1-my-question` where the ID is `1`.
  - The `entity_id` key of the question object. You can find a question's entity ID in the info panel when viewing a question.

```typescript jsx
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

You can pass parameter values to questions defined with SQL via `parameterValues` prop, in the format of `{parameter_name: parameter_value}`. Learn more about [SQL parameters](../questions/native-editor/sql-parameters.md)

```jsx
<StaticQuestion questionId={questionId} parameterValues={{ product_id: 50 }} />
```

## Creating a Question

With the `CreateQuestion` component, you can create a new question from scratch with Metabase's query builder.

```tsx
import React from "react";
import {MetabaseProvider, CreateQuestion} from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
    return (
        <MetabaseProvider config={config}>
            <CreateQuestion/>
        </MetabaseProvider>
    );
}
```

## Editing a question

With the `ModifyQuestion` component, you can edit an existing question using the query builder.

```tsx
import React from "react";
import {MetabaseProvider, ModifyQuestion} from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
    return (
        <MetabaseProvider config={config}>
            <ModifyQuestion questionId={1}/>
        </MetabaseProvider>
    );
}

```
