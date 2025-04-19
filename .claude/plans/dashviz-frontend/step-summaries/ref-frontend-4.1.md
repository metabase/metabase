# Click Behavior and Drill-Through

This document provides a comprehensive analysis of the click behavior and drill-through functionality in the Metabase frontend.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Click Action System](#click-action-system)
3. [Drill-Through System](#drill-through-system)
4. [Custom Click Behaviors](#custom-click-behaviors)
5. [User Interaction Flow](#user-interaction-flow)
6. [Extension Points](#extension-points)

## Architecture Overview

The Metabase click behavior and drill-through system follows a modular architecture that enables dynamic visualization interactions. The system is composed of the following main components:

### Core Components
- **Mode**: Defines the behavior mode that determines available click actions
- **ClickActionsPopover**: UI component that displays available actions when a visualization element is clicked
- **ClickBehaviorSidebar**: Configuration UI for custom click behaviors
- **Drill Types**: Individual drill-through actions that can be applied when clicking visualizations

### Conceptual Model
The system is built around several key concepts:

1. **ClickObject**: Represents what was clicked on in a visualization, containing:
   ```typescript
   interface ClickObject {
     element: Element;            // DOM element clicked
     event: MouseEvent;           // Browser event
     column: DatasetColumn;       // Column metadata
     value: any;                  // Clicked value
     data: any[];                 // Row data
     dimensions: Dimension[];     // Dimensions related to the click
   }
   ```

2. **ClickAction**: Describes an action that can be performed on a click:
   ```typescript
   interface ClickAction {
     name: string;                // Unique identifier
     title: string;               // Display name
     section?: string;            // Grouping category 
     icon?: string;               // Icon name
     
     // One or more of these action types:
     question?: () => Question;   // Change question
     url?: () => string;          // Navigate to URL
     action?: () => any;          // Dispatch Redux action
     
     // Additional properties
     default?: boolean;           // Is this the default action?
     buttonType?: string;         // UI styling
   }
   ```

3. **Mode**: Determines what actions are available in a given context:
   ```typescript
   class Mode {
     constructor(question, queryMode, plugins) { ... }
     
     actionsForClick(clicked, settings, extraData): ClickAction[] {
       // Determine available actions for the clicked element
     }
   }
   ```

## Click Action System

The click action system determines what happens when a user clicks on a visualization element.

### Action Types
The system supports three main types of actions:

1. **Question Change**: Modifies the current question to show different data
   ```javascript
   {
     question: () => question.filter(...),
     questionChangeBehavior: "changeCardAndRun"
   }
   ```

2. **URL Navigation**: Redirects to another page or URL
   ```javascript
   {
     url: () => `/dashboard/${dashboardId}`
   }
   ```

3. **Redux Action**: Dispatches an action to the Redux store
   ```javascript
   {
     action: () => ({ type: "metabase/some-action", payload: {...} })
   }
   ```

### Action Execution
When a user selects an action, it is executed by the `performAction` function:

```javascript
export function performAction(
  action,
  { dispatch, onChangeCardAndRun, onUpdateQuestion },
) {
  let didPerform = false;
  if (action.action) {
    const reduxAction = action.action();
    if (reduxAction) {
      dispatch(reduxAction);
      didPerform = true;
    }
  }
  if (action.url) {
    const url = action.url();
    if (url) {
      open(url, { 
        openInSameOrigin: (location) => {
          dispatch(push(location));
        }
      });
      didPerform = true;
    }
  }
  if (action.question) {
    const { questionChangeBehavior = "changeCardAndRun" } = action;
    const question = action.question();
    if (question) {
      if (questionChangeBehavior === "changeCardAndRun") {
        onChangeCardAndRun({ nextCard: question.card() });
      } else if (questionChangeBehavior === "updateQuestion") {
        onUpdateQuestion(question);
      }
      didPerform = true;
    }
  }
  return didPerform;
}
```

### Action Organization
Actions are organized into sections for the UI:

- **Records**: Actions related to viewing underlying data records
- **Details**: Actions showing details about specific values
- **Zoom**: Actions for zooming in/out of data
- **Sort**: Actions for sorting
- **Automatic Insights**: Actions for showing AI-powered insights
- **Break Out**: Actions for breaking data down by dimension
- **Distribution**: Actions showing value distributions
- **Summarize**: Actions for aggregating data

## Drill-Through System

The drill-through system allows users to explore data by interacting with visualization elements. It leverages the Metabase query library to generate new questions based on clicks.

### Drill Types
Metabase supports the following drill types (defined in `constants.ts`):

```typescript
export const DRILLS: Record<Lib.DrillThruType, Drill<any>> = {
  "drill-thru/automatic-insights": automaticInsightsDrill,
  "drill-thru/column-extract": columnExtractDrill,
  "drill-thru/column-filter": columnFilterDrill,
  "drill-thru/combine-columns": combineColumnsDrill,
  "drill-thru/distribution": distributionDrill,
  "drill-thru/fk-details": fkDetailsDrill,
  "drill-thru/fk-filter": fkFilterDrill,
  "drill-thru/pivot": pivotDrill,
  "drill-thru/pk": pkDrill,
  "drill-thru/quick-filter": quickFilterDrill,
  "drill-thru/sort": sortDrill,
  "drill-thru/summarize-column-by-time": summarizeColumnByTimeDrill,
  "drill-thru/summarize-column": summarizeColumnDrill,
  "drill-thru/underlying-records": underlyingRecordsDrill,
  "drill-thru/zoom": zoomDrill,
  "drill-thru/zoom-in.binning": zoomInBinningDrill,
  "drill-thru/zoom-in.geographic": zoomInGeographicDrill,
  "drill-thru/zoom-in.timeseries": zoomInTimeseriesDrill,
};
```

### Drill Implementation
Each drill type implements a function that generates click actions:

```typescript
// Example: Underlying Records Drill
export const underlyingRecordsDrill: Drill<
  Lib.UnderlyingRecordsDrillThruInfo
> = ({ drill, drillInfo, applyDrill }): QuestionChangeClickAction[] => {
  const { tableName, rowCount } = drillInfo;
  
  // Create display name based on context
  const tableTitle = inflect(tableName, rowCount);
  
  return [{
    name: "underlying-records",
    title: `See these ${tableTitle}`,
    section: "records",
    icon: "table_spaced",
    buttonType: "horizontal",
    question: () =>
      applyDrill(drill)
        .setDisplay("table")
        .updateSettings({ "table.pivot": false }),
  }];
};
```

### Drill Selection
Available drills are determined by the query library's `availableDrillThrus` function:

```typescript
export function queryDrill(
  question: Question,
  clicked: Lib.ClickObject,
  isDrillEnabled: (drill: DrillThruDisplayInfo) => boolean,
): ClickAction[] {
  const query = question.query();
  const stageIndex = -1;
  
  // Get available drills from the query library
  const drills = Lib.availableDrillThrus(
    query,
    stageIndex,
    question.id(),
    clicked.column,
    clicked.value,
    clicked.data,
    clicked.dimensions,
  );

  // Helper to apply a drill
  const applyDrill = (drill: Lib.DrillThru, ...args: unknown[]) => {
    const newQuery = Lib.drillThru(
      query,
      stageIndex,
      question.id(),
      drill,
      ...args,
    );
    return question.setQuery(newQuery);
  };

  // Create click actions for each drill
  return drills
    .flatMap((drill) => {
      const drillInfo = Lib.displayInfo(query, stageIndex, drill);
      const drillHandler = DRILLS[drillInfo.type];

      if (!isDrillEnabled(drillInfo) || !drillHandler) {
        return null;
      }

      return drillHandler({
        question,
        query,
        stageIndex,
        drill,
        drillInfo,
        clicked,
        applyDrill,
      });
    })
    .filter(isNotNull);
}
```

## Custom Click Behaviors

Metabase allows dashboard creators to configure custom click behaviors for dashboard elements, overriding the default drill-through menu.

### Types of Custom Click Behaviors

1. **Link Behavior**: Navigate to URLs, dashboards, or questions
   ```typescript
   interface LinkClickBehavior {
     type: "link";
     linkType: "url" | "dashboard" | "question";
     
     // For URL links
     linkTemplate?: string;
     
     // For dashboard/question links 
     targetId?: number;
     
     // For dashboard links with tabs
     tabId?: number;
   }
   ```

2. **Cross-filter Behavior**: Filter other cards on the dashboard
   ```typescript
   interface CrossFilterClickBehavior {
     type: "crossfilter";
     parameterMapping: {
       [parameterId: string]: {
         source: { type: string, id: string };
         target: { type: string, id: string };
       };
     };
   }
   ```

3. **Action Behavior**: Trigger custom actions (enterprise)
   ```typescript
   interface ActionClickBehavior {
     type: "action";
     actionType: string;
     // Additional action-specific fields
   }
   ```

### Configuration UI
The `ClickBehaviorSidebar` component provides a UI for configuring custom click behaviors:

```jsx
<ClickBehaviorSidebar
  dashboard={dashboard}
  dashcard={dashcard}
  parameters={parameters}
  hideClickBehaviorSidebar={hideClickBehaviorSidebar}
  onUpdateDashCardColumnSettings={onUpdateDashCardColumnSettings}
  onUpdateDashCardVisualizationSettings={onUpdateDashCardVisualizationSettings}
  onReplaceAllDashCardVisualizationSettings={onReplaceAllDashCardVisualizationSettings}
/>
```

### Storage
Custom click behaviors are stored in two locations:

1. **Card-level behaviors**: Applied to the entire visualization
   ```javascript
   dashcard.visualization_settings.click_behavior = {
     type: "link",
     linkType: "dashboard",
     targetId: 5
   };
   ```

2. **Column-level behaviors**: Applied to specific columns in table visualizations
   ```javascript
   dashcard.visualization_settings.column_settings = {
     '["name","column_name"]': {
       click_behavior: {
         type: "crossfilter",
         parameterMapping: { ... }
       }
     }
   };
   ```

## User Interaction Flow

The click behavior system follows a specific flow when a user interacts with a visualization:

### 1. Capturing the Click
When a user clicks on a visualization element, the component creates a `ClickObject`:

```typescript
// In visualization component
handleClick = (event, { column, value, dimensions, data }) => {
  this.props.onVisualizationClick({
    element: event.currentTarget,
    event,
    column,
    value, 
    dimensions,
    data,
  });
};
```

### 2. Determining Available Actions
The `Visualization` component passes the click to its click handling logic:

```typescript
handleVisualizationClick = (clicked: ClickObject | null) => {
  const { handleVisualizationClick } = this.props;

  if (typeof handleVisualizationClick === "function") {
    handleVisualizationClick(clicked);
    return;
  }

  const didPerformDefaultAction = performDefaultAction(
    this.getClickActions(clicked),
    {
      dispatch: this.props.dispatch,
      onChangeCardAndRun: this.handleOnChangeCardAndRun,
    },
  );

  if (didPerformDefaultAction) {
    return;
  }

  // Show popover with actions
  this.setState({ clicked });
};
```

### 3. Displaying the Actions Popover
If no default action is performed, the `ClickActionsPopover` component is displayed:

```jsx
<ConnectedClickActionsPopover
  clicked={clicked}
  clickActions={regularClickActions}
  onChangeCardAndRun={this.handleOnChangeCardAndRun}
  onUpdateQuestion={this.props.onUpdateQuestion}
  onClose={this.hideActions}
  series={series}
  onUpdateVisualizationSettings={onUpdateVisualizationSettings}
/>
```

### 4. Action Selection and Execution
When a user selects an action, the popover's `handleClickAction` method is called:

```typescript
handleClickAction = (action: RegularClickAction) => {
  const { dispatch, onChangeCardAndRun, onUpdateQuestion } = this.props;
  if (isPopoverClickAction(action)) {
    this.setState({ popoverAction: action });
  } else {
    const didPerform = performAction(action, {
      dispatch,
      onChangeCardAndRun,
      onUpdateQuestion,
    });
    if (didPerform) {
      this.close();
    }
  }
};
```

## Extension Points

The click behavior system provides several extension points for customization:

### 1. Custom Drill Types
New drill types can be added by extending the `DRILLS` object:

```typescript
// Add a new drill type
DRILLS["drill-thru/my-custom-drill"] = ({ drill, drillInfo, applyDrill }) => {
  return [{
    name: "my-custom-action",
    title: "Do something custom",
    section: "details",
    question: () => applyDrill(drill)
  }];
};
```

### 2. Custom Modes
Different contexts can have different available actions by defining custom modes:

```typescript
// Create a custom mode
const customMode = {
  name: "custom",
  hasDrills: true,
  availableOnlyDrills: [
    "drill-thru/underlying-records",
    "drill-thru/zoom",
  ],
  clickActions: [
    // Custom click actions
    (props) => [{ 
      name: "custom-action",
      title: "Custom Action",
      // Action implementation
    }]
  ]
};

// Use the custom mode
new Mode(question, customMode);
```

### 3. Embedding SDK Plugins
The embedding SDK can customize click behaviors:

```typescript
// In Mode.ts
if (this._plugins?.mapQuestionClickActions) {
  actions = this._plugins.mapQuestionClickActions(actions, {
    value: clicked.value,
    column: clicked.column,
    event: clicked.event,
    data: clicked.data,
  });
}
```

### 4. Custom Click Behavior Types
The system can be extended with new click behavior types:

```typescript
// Add a new click behavior type
interface CustomClickBehavior {
  type: "custom";
  // Custom properties
}

// Update type definitions
type ClickBehavior = 
  | LinkClickBehavior
  | CrossFilterClickBehavior
  | ActionClickBehavior
  | CustomClickBehavior;
```

## Conclusion

The click behavior and drill-through system in Metabase provides a powerful framework for interactive data exploration. It balances default behaviors that work out-of-the-box with extensive customization options for dashboard creators. Key strengths of the architecture include:

1. **Modularity**: Each drill type is implemented separately and can be enabled/disabled independently
2. **Contextual Actions**: Available actions change based on what is clicked and the visualization context
3. **Extensibility**: Multiple extension points for adding custom behaviors
4. **User-Friendly Configuration**: Dashboard creators can customize behaviors without coding
5. **Integration with Query Engine**: Uses the same query library that powers questions and dashboards

This architecture enables a wide range of interactive experiences from simple filtering to complex cross-dashboard navigation, enhancing the overall data exploration capabilities of Metabase.