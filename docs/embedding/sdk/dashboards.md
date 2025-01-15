---
title: "Embedded analytics SDK - dashboards"
---

# Embedded analytics SDK - dashboards

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true enterprise-only=true %}

You can embed an interactive, editable, or static dashboard.

**Please keep in mind - embedding multiple instances of dashboards on the same page is not yet supported.**

## Embedding a dashboard

You can embed a dashboard using the one of the dashboard components:

- `InteractiveDashboard`
- `StaticDashboard`
- `EditableDashboard`

## Dashboard component props

| Prop                         | Type                                            | Description                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dashboardId                  | `number \| string`                              | The ID of the dashboard. This is either:<br>- the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`<br>- the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data |
| initialParameters            | `Record<string, string \| string[]>`            | Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.                                                                                                                                                                                                   |
| withTitle                    | `boolean`                                       | Whether the dashboard should display a title.                                                                                                                                                                                                                                                                                    |
| withCardTitle                | `boolean`                                       | Whether the dashboard cards should display a title.                                                                                                                                                                                                                                                                              |
| withDownloads                | `boolean \| null`                               | Whether to hide the download button.                                                                                                                                                                                                                                                                                             |
| hiddenParameters             | `string[] \| null`                              | A list of [parameters to hide](../../embedding/public-links.md#appearance-parameters).                                                                                                                                                                                                                                           |
| drillThroughQuestionHeight\* | `number \| null`                                | Height of a question component when drilled from the dashboard to a question level.                                                                                                                                                                                                                                              |
| questionPlugins\*            | `{ mapQuestionClickActions: Function } \| null` | Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.                                                                                                                                                                                                     |
| onLoad                       | `(dashboard: Dashboard \| null) => void`        | Event handler that triggers after dashboard loads with all visible cards and their content.                                                                                                                                                                                                                                      |
| onLoadWithoutCards           | `(dashboard: Dashboard \| null) => void`        | Event handler that triggers after dashboard loads, but without its cards - at this stage dashboard title, tabs and cards grid is rendered, but cards content is not yet loaded.                                                                                                                                                  |
| renderDrillThroughQuestion\* | `() => ReactNode`                               | A react component that renders [a question's layout](#customizing-drill-through-question-layout) shown after drilling through a question or clicking on a question card in the dashboard.                                                                                                                                        |

_\* Not available for `StaticDashboard`._

By default, dashboard components take full page height (100vh). You can override this with custom styles passed via `style` or `className` props.

```tsx
<EditableDashboard
  style={{
    height: 800,
    minHeight: "auto",
  }}
  dashboardId={dashboardId}
/>
```

## Example embedded dashboard with `InteractiveDashboard` component

```typescript
import React from "react";
import {MetabaseProvider, InteractiveDashboard} from "@metabase/embedding-sdk-react";

const authConfig = {...}

export default function App() {
    const dashboardId = 1; // This is the dashboard ID you want to embed
    const initialParameters = {}; // Define your query parameters here

    // choose parameter names that are in your dashboard
    const hiddenParameters = ["location", "city"]

    return (
        <MetabaseProvider authConfig={authConfig}>
            <InteractiveDashboard
                dashboardId={dashboardId}
                initialParameters={initialParameters}
                withTitle={false}
                withDownloads={false}
                hiddenParameters={hideParameters}
            />
        </MetabaseProvider>
    );
}
```

## Customizing drill-through question layout

When drilling through or clicking on a question card in the dashboard, you will be taken to the question view.

By default, the question is shown in the [default layout](./questions.md#customizing-interactive-questions) for interactive questions.

To customize the question layout, pass a `renderDrillThroughQuestion` prop to the `InteractiveDashboard` component,
with the custom view as the child component.

```typescript
<InteractiveQuestion
  questionId={95}
  renderDrillThroughQuestion={QuestionView}
/>;

// You can use namespaced components to build the question's layout.
const QuestionView = () => <InteractiveQuestion.Title />;
```

The questionView prop accepts a React component that will be rendered in the question view, which
you can build with namespaced components within the `InteractiveQuestion` component.
See [customizing interactive questions](./questions.md#customizing-interactive-questions) for an example layout.

## Dashboard plugins

### `dashcardMenu`

This plugin allows you to add, remove, and modify the custom actions on the overflow menu of dashboard cards. The plugin appears as a dropdown menu on the top right corner of the card.

The plugin's default configuration looks like this:

```typescript
const plugins = {
  dashboard: {
    dashcardMenu: {
      withDownloads: true,
      withEditLink: true,
      customItems: [],
    },
  },
};
```

`dashcardMenu`: can be used in the InteractiveDashboard like this:

```typescript
{% raw %}
<InteractiveDashboard
  questionId={1}
  plugins={{
    dashboard: {
      dashcardMenu: null,
    },
  }}
/>
{% endraw %}
```

#### Enabling/disabling default actions

To remove the download button from the dashcard menu, set `withDownloads` to `false`. To remove the edit link from the dashcard menu, set `withEditLink` to `false`.

```typescript
const plugins = {
  dashboard: {
    dashcardMenu: {
      withDownloads: false,
      withEditLink: false,
      customItems: [],
    },
  },
};
```

#### Adding custom actions to the existing menu:

You can add custom actions to the dashcard menu by adding an object to the `customItems` array. Each element can either be an object or a function that takes in the dashcard's question, and outputs a list of custom items in the form of:

```typescript
{
    iconName: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
}
```

Here's an example:

```typescript
const plugins: MetabasePluginsConfig = {
  dashboard: {
    dashcardMenu: {
      customItems: [
        {
          iconName: "chevronright",
          label: "Custom action",
          onClick: () => {
            alert(`Custom action clicked`);
          },
        },
        ({ question }) => {
          return {
            iconName: "chevronright",
            label: "Custom action",
            onClick: () => {
              alert(`Custom action clicked ${question.name}`);
            },
          };
        },
      ],
    },
  },
};
```

#### Replacing the existing menu with your own component

If you want to replace the existing menu with your own component, you can do so by providing a function that returns a React component. This function also can receive the question as an argument.

```typescript
const plugins: MetabasePluginsConfig = {
  dashboard: {
    dashcardMenu: ({ question }) => (
      <button onClick={() => console.log(question.name)}>Click me</button>
    ),
  },
};
```

## Creating dashboards

Creating a dashboard could be done with `useCreateDashboardApi` hook or `CreateDashboardModal` component.

### Hook

```typescript
const { createDashboard } = useCreateDashboardApi();

const handleDashboardCreate = async () => {
  const dashboard = await createDashboard(props);

  // do something with created empty dashboard, e.g., use the dashboard in EditableDashboard component
};

return <Button onClick={handleDashboardCreate}>Create new dashboard</Button>;
```

Props:

| Prop         | Type                                     | Description                                                                                                 |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| name         | `string`                                 | (required) Dashboard title                                                                                  |
| description  | `string \| null`                         | Optional dashboard description                                                                              |
| collectionId | `number \| 'root' \| 'personal' \| null` | Collection where to create a new dashboard. You can use predefined system values like `root` or `personal`. |

### Component

```typescript
const [dashboard, setDashboard] = useState<Dashboard | null>(null);

if (dashboard) {
  return <EditableDashboard dashboardId={dashboard.id} />;
}

return <CreateDashboardModal onClose={handleClose} onCreate={setDashboard} />;
```

Supported component props:

| Prop          | Type                                     | Description                                                                                     |
| ------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| collectionId? | `number \| 'root' \| 'personal' \| null` | Initial collection field value. You can use predefined system values like `root` or `personal`. |
| onCreate      | `(dashboard: Dashboard) => void`         | Handler to react on dashboard creation.                                                         |
| onClose       | `() => void`                             | Handler to close modal component                                                                |
