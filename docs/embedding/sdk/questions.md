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

![Static question](../images/static-question.png)

You can embed a static question using the `StaticQuestion` component.

The component has a default height, which can be customized by using the `height` prop. To inherit the height from the parent container, you can pass `100%` to the height prop.

```typescript
import React from "react";
import {MetabaseProvider, StaticQuestion, defineMetabaseAuthConfig} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({...});

export default function App() {
    const questionId = 1; // This is the question ID you want to embed

    return (
        <MetabaseProvider authConfig={authConfig}>
            <StaticQuestion questionId={questionId} withChartTypeSelector={false}/>
        </MetabaseProvider>
    );
}
```

## Embedding an interactive question

![Interactive question](../images/interactive-question.png)

You can embed an interactive question using the `InteractiveQuestion` component.

```typescript
import React from "react";
import {MetabaseProvider, InteractiveQuestion, defineMetabaseAuthConfig} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({...});

export default function App() {
    const questionId = 1; // This is the question ID you want to embed

    return (
        <MetabaseProvider authConfig={authConfig}>
            <InteractiveQuestion questionId={questionId}/>
        </MetabaseProvider>
    );
}
```

## Question props

| Prop                    | Type                                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entityTypeFilter`      | string array; options include "table", "question", "model", "metric" | (optional) An array that specifies which entity types are available in the data picker                                                                                                                                                                                                                                                                                                                                                          |
| `height`                | number or string                                                     | (optional) A number or string specifying a CSS size value that specifies the height of the component                                                                                                                                                                                                                                                                                                                                            |
| `initialSqlParameters`  | `Record<string, string \| string[]>`                                 | (optional) For SQL questions only. A mapping of [SQL parameter names to parameter values](#pass-sql-parameters-to-sql-questions-with-initialsqlparameters), such as `{ product_id: "42"}`                                                                                                                                                                                                                                                       |
| `isSaveEnabled`         | boolean                                                              | (optional, default: `true`) Whether users can save the question                                                                                                                                                                                                                                                                                                                                                                                 |
| `onBeforeSave`          | `() => void`                                                         | (optional) A callback function that triggers before saving. Only relevant when `isSaveEnabled = true`                                                                                                                                                                                                                                                                                                                                           |
| `onSave`                | `() => void`                                                         | (optional) A callback function that triggers when a user saves the question. Only relevant when `isSaveEnabled = true`                                                                                                                                                                                                                                                                                                                          |
| `plugins`               | `{ mapQuestionClickActions: Function }` or null                      | Additional mapper function to override or add drill-down menu                                                                                                                                                                                                                                                                                                                                                                                   |
| `questionId`            | number or string                                                     | (required) The ID of the question. This is either:<br>- The numerical ID when accessing a question link, e.g., `http://localhost:3000/question/1-my-question` where the ID is `1`<br>- The `entity_id` key of the question object. You can find a question's Entity ID in the info panel when viewing a question<br>- `new` to show the notebook editor for creating new questions. `isSaveEnabled` must be `true` to allow saving the question |
| `targetCollection`      | number \| "root" \| "personal"                                       | (optional) The collection to save the question to. This will hide the collection picker from the save modal. Only applicable to interactive questions                                                                                                                                                                                                                                                                                           |
| `title`                 | boolean \| string \| `ReactNode` \| `() => ReactNode`                | (optional) Determines whether the question title is displayed, and allows a custom title to be displayed instead of the default question title. Shown by default. Only applicable to interactive questions when using the default layout                                                                                                                                                                                                        |
| `withChartTypeSelector` | boolean                                                              | (optional, default: `true`) Determines whether the chart type selector and corresponding settings button are shown. Only relevant when using the default layout                                                                                                                                                                                                                                                                                 |
| `withResetButton`       | boolean                                                              | (optional, default: `true`) Determines whether a reset button is displayed. Only relevant when using the default layout                                                                                                                                                                                                                                                                                                                         |

## Pass SQL parameters to SQL questions with `initialSqlParameters`

You can pass parameter values to questions defined with SQL via the `initialSqlParameters` prop, in the format of `{parameter_name: parameter_value}`. Learn more about [SQL parameters](../../questions/native-editor/sql-parameters.md).

```typescript
{% raw %}
<StaticQuestion questionId={questionId} initialSqlParameters={{ product_id: 50 }} />
{% endraw %}
```

`initialSqlParameters` can't be used with questions built using the query builder.

## Customizing interactive questions

By default, the Embedded analytics SDK provides a default layout for interactive questions that allows you to view your questions, apply filters and aggregations, and access functionality within the query builder.

Here's an example of using the `InteractiveQuestion` component with its default layout:

```typescript
<InteractiveQuestion questionId={95} />
```

To customize the layout, use namespaced components within the `InteractiveQuestion` component. For example:

```typescript
{% raw %}
    <div className="App" style={{ width: "100%", maxWidth: "1600px", height: "800px", margin: "0 auto" }}>
      <MetabaseProvider authConfig={config} theme={theme}>
        <InteractiveQuestion questionId={questionId}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <div style={{ display: "grid", placeItems: "center", width: "100%" }}>
              <InteractiveQuestion.Title />
              <InteractiveQuestion.ResetButton />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                overflow: "hidden",
                width: "100%",
              }}
            >
              <div style={{ width: "100%" }}>
                <InteractiveQuestion.QuestionVisualization />
              </div>
              <div style={{ display: "flex", flex: 1, overflow: "scroll" }}>
                <InteractiveQuestion.Summarize />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
              <InteractiveQuestion.Filter />
            </div>
          </div>
        </InteractiveQuestion>
      </MetabaseProvider>
    </div>
{% endraw %}
```

## Interactive question components

These components are available via the `InteractiveQuestion` namespace (e.g., `<InteractiveQuestion.Filter />`).

_\* signifies a required prop_

### `InteractiveQuestion.BackButton`

A navigation button that returns to the previous view. Only renders when `onNavigateBack` prop from `InteractiveQuestion` is available.

Uses [Mantine ActionIcon props](https://v6.mantine.dev/core/action-icon/) under the hood, as well as:

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.Breakout`

A set of badges for managing data groupings (breakouts).

No props. Uses question context for breakout functionality.

### `InteractiveQuestion.BreakoutDropdown`

Dropdown button for the Breakout component.

Uses [Popover props](https://v6.mantine.dev/core/popover/?t=props) except `onClose`, `children`, and `opened` under the hood, as well as:

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.ChartTypeDropdown`

Dropdown for selecting the visualization type (bar chart, line chart, table, etc.). Automatically updates to show recommended visualization types for the current data.

Uses [Mantine Menu props](https://v6.mantine.dev/core/menu/?t=props) under the hood, as well as:

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.ChartTypeSelector`

Detailed chart type selection interface with recommended visualization options.

Uses [Mantine Stack props](https://v6.mantine.dev/core/stack/?t=props) under the hood, as well as:

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.Editor`

Advanced query editor that provides full access to question configuration. Includes filtering, aggregation, custom expressions, and joins.

_Replaces deprecated `InteractiveQuestion.Notebook`_

| Prop    | Type       | Description                                         |
| ------- | ---------- | --------------------------------------------------- |
| onApply | () => void | Callback function executed when changes are applied |

### `InteractiveQuestion.EditorButton`

_Replaces deprecated `InteractiveQuestion.NotebookButton`_

Toggle button for showing/hiding the Editor interface. In custom layouts, the `EditorButton` _must_ have an `onClick` handler or the button won't do anything when clicked.

Uses [Mantine ActionIcon props](https://v6.mantine.dev/core/action-icon/) under the hood, as well as:

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| isOpen    | boolean             | Whether the editor is currently open            |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.Filter`

A set of interactive filter badges that allow adding, editing, and removing filters. Displays current filters as badges with an "Add another filter" option.

| Prop               | Type    | Description                                          |
| ------------------ | ------- | ---------------------------------------------------- |
| withColumnItemIcon | boolean | Whether to show column icons in the filter interface |

### `InteractiveQuestion.FilterDropdown`

A dropdown button for the Filter component.

| Prop               | Type    | Description                                          |
| ------------------ | ------- | ---------------------------------------------------- |
| withColumnItemIcon | boolean | Whether to show column icons in the filter interface |

### `InteractiveQuestion.QuestionSettings`

Settings panel for configuring visualization options like axes, colors, and formatting.

No props. Uses question context for settings.

### `InteractiveQuestion.QuestionSettingsDropdown`

Dropdown button that contains the QuestionSettings component.

Uses [Popover props](https://v6.mantine.dev/core/popover/?t=props) except `onClose` and `opened` under the hood, as well as:

| Prop      | Type                          | Description                                     |
| --------- | ----------------------------- | ----------------------------------------------- |
| height    | React.CSSProperties["height"] | Height for the dropdown menu                    |
| className | string                        | Custom CSS class name for styling the component |
| style     | React.CSSProperties           | Inline styles to apply to the component         |

### `InteractiveQuestion.QuestionVisualization`

The main visualization component that renders the question results as a chart, table, or other visualization type.

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| height    | number \| string    | Height for visualization                        |
| width     | number \| string    | Width for visualization                         |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.ResetButton`

Button to reset question modifications. Only appears when there are unsaved changes to the question.

Uses [Mantine Button props](https://v6.mantine.dev/core/button/?t=props) under the hood, as well as:

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.SaveButton`

Button for saving question changes. Only enabled when there are unsaved modifications to the question.

_Note_: Currently, in custom layouts, the `SaveButton` must have an `onClick` handler or the button will not do anything when clicked.

Uses [Mantine Button props](https://v6.mantine.dev/core/button/?t=props) under the hood, as well as:

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.SaveQuestionForm`

Form for saving a question, including title and description. When saved:

- For new questions: Calls `onCreate` prop from InteractiveQuestion
- For existing questions: Calls `onSave` prop from InteractiveQuestion
- Both callbacks receive the updated question object
- Form can be cancelled via the `onCancel` prop

| Prop     | Type       | Description                                       |
| -------- | ---------- | ------------------------------------------------- |
| onCancel | () => void | Callback function executed when save is cancelled |

### `InteractiveQuestion.Summarize`

Interface for adding and managing data summaries (like counts, sums, averages). Displays as a set of badges.

No props. Uses question context for summarization functionality.

### `InteractiveQuestion.SummarizeDropdown`

Dropdown button for the Summarize component.

Uses [Popover props](https://v6.mantine.dev/core/popover/?t=props) except `onClose`, `children`, and `opened` under the hood, as well as:

| Prop      | Type                | Description                                     |
| --------- | ------------------- | ----------------------------------------------- |
| className | string              | Custom CSS class name for styling the component |
| style     | React.CSSProperties | Inline styles to apply to the component         |

### `InteractiveQuestion.Title`

Displays a title based on the question's state. Shows:

- The question's display name if it's saved
- An auto-generated description for ad-hoc questions (non-native queries)
- "New question" as fallback or for new/native queries

| Prop      | Type          | Description                                     |
| --------- | ------------- | ----------------------------------------------- |
| className | string        | Custom CSS class name for styling the component |
| style     | CSSProperties | Inline styles to apply to the component         |

## Interactive question plugins

You can use [plugins](./plugins.md) to add custom functionality to your questions.

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
  <MetabaseProvider authConfig={authConfig} pluginsConfig={plugins}>
    <InteractiveQuestion questionId={questionId} />
  </MetabaseProvider>
);
```

## Prevent people from saving changes to an `InteractiveQuestion`

To prevent people from saving changes to an interactive question, or from saving changes as a new question, you can set `isSaveEnabled={false}`:

```tsx
import React from "react";
import {MetabaseProvider, InteractiveQuestion} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({...});

export default function App() {
    return (
        <MetabaseProvider authConfig={authConfig}>
            <InteractiveQuestion questionId={1} isSaveEnabled={false} />
        </MetabaseProvider>
    );
}
```

## Embedding the query builder for creating new questions

![Query builder](../images/query-builder.png)

You can embed the query builder for creating new questions by passing the `questionId="new"` prop to the `InteractiveQuestion` component. You can use the [`children` prop](#customizing-interactive-questions) to customize the layout for creating new questions.

```tsx
import React from "react";
import {MetabaseProvider, InteractiveQuestion} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({...});

export default function App() {
    return (
        <MetabaseProvider authConfig={authConfig}>
            <InteractiveQuestion questionId="new" />
        </MetabaseProvider>
    );
}
```

To customize the question editor's layout, use the `InteractiveQuestion` component [directly with a custom `children` prop](#customizing-interactive-questions).
