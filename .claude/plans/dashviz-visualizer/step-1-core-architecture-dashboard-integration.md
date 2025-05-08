# Core Architecture and Dashboard Integration

## Component Index

```
frontend/src/metabase-types/
├── api/
│   ├── visualizer.ts                     # Core visualizer API types
│   └── dashboard.ts                      # Dashboard types with visualizer extensions
├── store/
│   └── visualizer.ts                     # Store state types for visualizer

frontend/src/metabase/visualizer/
├── visualizer.slice.ts                   # Redux state management
├── selectors.ts                          # State selectors
├── utils/
│   ├── dashboard-card-supports-visualizer.ts  # Utility to check card compatibility
│   ├── is-visualizer-dashboard-card.ts        # Type guard for visualizer cards
│   ├── get-initial-state-for-card-data-source.ts  # Initialize from card data
│   └── get-initial-state-for-visualizer-card.ts   # Initialize from visualizer card
```

## Feature Summary

The visualizer feature introduces a new dashboard card type that allows users to create custom visualizations through a drag-and-drop interface. Unlike traditional dashboard cards that display predefined question results, visualizer cards allow users to:

1. Select one or more data sources (cards/questions)
2. Visually map columns to different parts of a visualization
3. Customize visualization settings and appearance
4. Combine data from multiple sources into a single visualization

This feature enhances Metabase's dashboard capabilities by providing a more flexible, interactive way to create visualizations directly within dashboards without needing to create separate questions first.

## Core Architecture

### Type Definitions

The visualizer feature defines several key types:

1. **VisualizerDataSource**: Represents a data source for a visualizer card, currently supporting card (question) data sources:
   ```typescript
   export type VisualizerDataSource = {
     id: VisualizerDataSourceId;  // Format: "card:123"
     sourceId: number;            // The actual card ID
     type: VisualizerDataSourceType;  // Currently only "card"
     name: string;                // Display name for the data source
   };
   ```

2. **VisualizerColumnReference**: Maps a column from a data source to a visualization dimension:
   ```typescript
   export type VisualizerColumnReference = {
     sourceId: VisualizerDataSourceId;  // Which data source this column comes from
     name: string;                      // Name in the combined dataset
     originalName: string;              // Original name in the source dataset
   };
   ```

3. **VisualizerVizDefinition**: Core definition of a visualizer visualization:
   ```typescript
   export type VisualizerVizDefinition = {
     display: VisualizationDisplay | null;  // Visualization type (bar, line, pie, etc.)
     columnValuesMapping: Record<string, VisualizerColumnValueSource[]>;  // Maps dimensions to columns
     settings: VisualizationSettings;  // Visualization settings
   };
   ```

### Dashboard Integration

The visualizer feature extends the existing dashboard card system by adding a new card type:

1. **VisualizerDashboardCard**: Extends the standard QuestionDashboardCard:
   ```typescript
   export type VisualizerDashboardCard = QuestionDashboardCard & {
     visualization_settings: BaseDashboardCard["visualization_settings"] & {
       visualization: VisualizerVizDefinition;
     };
   };
   ```

2. **Type Guard**: A function to identify visualizer cards:
   ```typescript
   export function isVisualizerDashboardCard(
     dashcard?: BaseDashboardCard,
   ): dashcard is VisualizerDashboardCard {
     if (!dashcard?.visualization_settings) {
       return false;
     }
     return dashcard.visualization_settings["visualization"] !== undefined;
   }
   ```

### State Management

The visualizer uses Redux for state management with the `visualizer.slice.ts` implementing a comprehensive state slice with:

1. **State Structure**:
   ```typescript
   export interface VisualizerState extends VisualizerVizDefinitionWithColumns {
     initialState: VisualizerVizDefinitionWithColumns;
     cards: Card[];
     datasets: Record<VisualizerDataSourceId, Dataset>;
     loadingDataSources: Record<VisualizerDataSourceId, boolean>;
     loadingDatasets: Record<VisualizerDataSourceId, boolean>;
     error: string | null;
     draggedItem: DraggedItem | null;
   }
   ```

2. **Key Actions**:
   - `initializeVisualizer`: Initializes from an existing card or state
   - `addDataSource`: Adds a new data source
   - `setDisplay`: Changes visualization type
   - `addColumn`: Adds a column to the visualization
   - `removeColumn`: Removes a column
   - `handleDrop`: Handles drag and drop interactions
   - `updateSettings`: Updates visualization settings

3. **History Management**: The visualizer implements undo/redo functionality using Redux-undo:
   ```typescript
   export const reducer = undoable(visualizerSlice.reducer, {
     filter: includeAction([
       initializeVisualizer.fulfilled.type,
       addColumn.type,
       setTitle.type,
       updateSettings.type,
       removeColumn.type,
       setDisplay.type,
       handleDrop.type,
       removeDataSource.type,
       addDataSource.fulfilled.type,
     ]),
     undoType: undo.type,
     redoType: redo.type,
     clearHistoryType: CLEAR_HISTORY,
     ignoreInitialState: true,
   });
   ```

## Dashboard Component Integration

The visualizer integrates with the existing dashboard system primarily through the `DashCardVisualization` component. This component:

1. **Detects Visualizer Cards**: Uses `isVisualizerDashboardCard()` to identify when a dashboard card is a visualizer card

2. **Prepares Visualization Data**: For visualizer cards, it:
   - Extracts the visualization definition from settings
   - Processes data sources and their datasets
   - Merges data from multiple sources if needed
   - Constructs a series object for the visualization component

3. **Renders Visualizations**: Uses the core `Visualization` component, passing:
   - The processed visualizer data
   - Settings from the visualizer definition
   - Visual display type

4. **Edit Flow**: Provides an edit flow via the `onEditVisualization` handler, which:
   - Initializes visualizer state from a card, multiple series, or existing visualizer card
   - Opens the visualizer UI for editing

## Implementation Details

1. **Data Transformation**: 
   - The visualizer transforms data from multiple sources to create unified visualizations
   - It uses utilities like `mergeVisualizerData()` to combine datasets
   - For certain chart types (like cartesian charts), it can split the data into multiple series

2. **Initialization Patterns**:
   - From card: `getInitialStateForCardDataSource()`
   - From multiple series: `getInitialStateForMultipleSeries()`
   - From existing visualizer card: `getInitialStateForVisualizerCard()`

3. **Visualization Type Support**:
   - The code has specific handlers for different visualization types
   - Currently supports cartesian charts (bar, line, area), pie charts, and funnels
   - Each visualization type has its own implementation for column mapping and data handling

4. **Data Source Management**:
   - Visualizer cards manage a set of data sources
   - Each data source is loaded and processed independently
   - The feature includes status tracking for loading states
   - Provides error handling for failed data source loading

The visualizer feature elegantly extends Metabase's existing dashboard architecture by introducing a specialized dashboard card type that maintains compatibility with the dashboard system while adding powerful new visualization creation capabilities.