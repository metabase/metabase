---
title: "Embedded analytics SDK - dashboards"
---

## Embedded analytics SDK - Dashboards

You can embed an interactive or static dashboard.

## Embedding a dashboard

You can embed a dashboard using the one of the dashboard components:

- `InteractiveDashboard`
- `StaticDashboard`
- `EditableDashboard`

## Dashboard component props

| Prop                   | Type                                            | Description                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dashboardId            | `number \| string`                              | The ID of the dashboard. This is either:<br>- the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`<br>- the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data |
| initialParameterValues | `Record<string, string \| string[]>`            | Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.                                                                                                                                                                                                   |
| withTitle              | `boolean`                                       | Whether the dashboard should display a title.                                                                                                                                                                                                                                                                                    |
| withCardTitle          | `boolean`                                       | Whether the dashboard cards should display a title.                                                                                                                                                                                                                                                                              |
| withDownloads          | `boolean \| null`                               | Whether to hide the download button.                                                                                                                                                                                                                                                                                             |
| hiddenParameters       | `string[] \| null`                              | A list of [parameters to hide](../../questions/sharing/public-links#filter-parameters)                                                                                                                                                                                                                                           |
| questionHeight\*       | `number \| null`                                | Height of a question component when drilled from the dashboard to a question level.                                                                                                                                                                                                                                              |
| questionPlugins\*      | `{ mapQuestionClickActions: Function } \| null` | Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.                                                                                                                                                                                                     |
| onLoad                 | `(dashboard: Dashboard \| null) => void`        | Event handler that triggers after dashboard loads with all visible cards and their content.                                                                                                                                                                                                                                      |
| onLoadWithoutCards     | `(dashboard: Dashboard \| null) => void`        | Event handler that triggers after dashboard loads, but without its cards - at this stage dashboard title, tabs and cards grid is rendered, but cards content is not yet loaded.                                                                                                                                                  |

_\* Not available for `StaticDashboard`._

## Example embedded dashboard with `InteractiveDashboard` component

```typescript jsx
import React from "react";
import {MetabaseProvider, InteractiveDashboard} from "@metabase/embedding-sdk-react";

const config = {...}

export default function App() {
    const dashboardId = 1; // This is the dashboard ID you want to embed
    const initialParameterValues = {}; // Define your query parameters here

    // choose parameter names that are in your dashboard
    const hiddenParameters = ["location", "city"]

    return (
        <MetabaseProvider config={config}>
            <InteractiveDashboard
                dashboardId={dashboardId}
                initialParameterValues={initialParameterValues}
                withTitle={false}
                withDownloads={false}
                hiddenParameters={hideParameters}
            />
        </MetabaseProvider>
    );
}
```

## Creating dashboards

Creating a dashboard could be done with `useCreateDashboardApi` hook or `CreateDashboardModal` component.

### Hook

```typescript jsx
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

```typescript jsx
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
