# Main UI Components

## Component Index

```
frontend/src/metabase/visualizer/components/
├── DataImporter/                         # Data source selection component
│   ├── DataImporter.tsx                  # Main data import interface
│   ├── DatasetsList/                     # Available data sources list
│   │   ├── DatasetsList.tsx              # List of datasets (questions)
│   │   └── getIsCompatible.ts            # Compatibility checking for datasets
│   └── ColumnsList/                      # Column selection for data sources
│       └── ColumnsList.tsx               # List of available columns
├── VisualizationCanvas/                  # Main visualization workspace
│   ├── VisualizationCanvas.tsx           # Container for visualization and wells
│   ├── VerticalWell/                     # Y-axis drop targets
│   │   ├── VerticalWell.tsx              # Router for visualization-specific wells
│   │   ├── CartesianVerticalWell.tsx     # Y-axis for cartesian charts
│   │   ├── PieVerticalWell.tsx           # "Slices by" well for pie charts
│   │   └── FunnelVerticalWell.tsx        # "Steps" well for funnel visualizations
│   ├── HorizontalWell/                   # X-axis drop targets
│   │   ├── HorizontalWell.tsx            # Router for visualization-specific wells
│   │   ├── CartesianHorizontalWell.tsx   # X-axis for cartesian charts
│   │   └── FunnelHorizontalWell.tsx      # "Values" well for funnel visualizations
│   ├── ScatterFloatingWell/              # Bubble size control for scatter plots
│   └── WellItem.tsx                      # Draggable items in wells
├── VizSettingsSidebar/                   # Settings configuration panel
│   └── VizSettingsSidebar.tsx            # Visualization settings interface
├── Visualizer/                           # Main container component
│   └── Visualizer.tsx                    # Layout and drag-drop context provider
├── VisualizerModal/                      # Modal wrapper
│   └── VisualizerModal.tsx               # Full-screen modal container
├── Footer/                               # Footer with undo/redo controls
│   └── Footer.tsx                        # Action buttons and info
├── Header/                               # Top navigation bar
│   └── Header.tsx                        # Title, save, and close controls
├── DragOverlay/                          # Drag and drop visual feedback
│   └── DragOverlay.tsx                   # Overlay for dragged items
└── VisualizerUiContext/                  # Shared UI state provider
    └── VisualizerUiContext.tsx           # Context for UI state management
```

## Feature Summary

The visualizer UI provides a comprehensive drag-and-drop interface for creating custom visualizations within dashboards. The interface consists of several key areas:

1. **Main Canvas**: Central area showing the visualization preview
2. **Data Sidebar**: Left panel for selecting data sources and columns
3. **Settings Sidebar**: Right panel for configuring visualization settings
4. **Dimensional Wells**: Drop zones around the visualization for mapping columns to chart dimensions (X-axis, Y-axis, etc.)

The UI follows a modal pattern, opening in a full-screen overlay when editing a visualization. It provides a complete environment for manipulating data visualizations with immediate visual feedback.

## Key Components

### Visualizer Component

The `Visualizer` component serves as the main container for the entire feature. Key aspects include:

1. **Layout Structure**:
   - Uses a grid layout to organize the sidebar, canvas, and controls
   - Wrapped in a drag-and-drop context from `@dnd-kit/core`
   - Manages global drag state for column mapping

2. **Component Composition**:
   - `Header`: Title and actions (save/close)
   - `DataImporter`: Data source management
   - `VisualizationCanvas`: The main workspace
   - `VizSettingsSidebar`: Visualization configuration
   - `Footer`: Utility controls including undo/redo
   - `DragOverlay`: Visual feedback during drag operations

3. **Key Behaviors**:
   - Keyboard shortcuts for undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z)
   - Drag-and-drop event handling for column mapping
   - Responsive layout adjustments for sidebar visibility

### VisualizationCanvas Component

The `VisualizationCanvas` component is the central workspace where visualizations appear and column mappings are configured. It features:

1. **Layout Structure**:
   - Grid layout with areas for the main visualization and "wells"
   - Wells positioned to match the visualization dimensions (sides, bottom)
   - Specialized placement for specific chart types (e.g., floating well for scatter plots)

2. **Conditional Rendering**:
   - Empty state guidance when no visualization is selected
   - Loading indicators during data fetching
   - Visualization preview using the core `Visualization` component
   - Tabular data preview option

3. **Visualization Wells**:
   - `VerticalWell`: Typically for Y-axis/metrics (cartesian), slices (pie), or steps (funnel)
   - `HorizontalWell`: Typically for X-axis/dimensions (cartesian) or values (funnel)
   - Wells adapt based on visualization type with specific implementations
   - Drop zones with visual feedback for valid/invalid drops

### Well Components

The well components serve as drop targets for mapping columns to visualization dimensions. Notable patterns include:

1. **Visualization-Specific Routing**:
   - `VerticalWell` and `HorizontalWell` route to specialized implementations
   - Different well behaviors for different chart types
   - Implementation examples:
     - `CartesianVerticalWell`: For metrics (Y-axis values)
     - `PieVerticalWell`: For category dimensions (slices) 
     - `FunnelVerticalWell`: For funnel steps

2. **Drag-and-Drop Integration**:
   - Each well uses `useDroppable` hook from dnd-kit
   - Well items use `useDraggable` for reordering
   - Compatible column validation for target wells
   - Visual feedback for valid drop targets

3. **Well Item Management**:
   - Items display column names with appropriate styling
   - Removal capability via X button
   - Reordering via drag-and-drop
   - Visual feedback during dragging

### DataImporter Component

The `DataImporter` component manages data sources and column selection:

1. **Dual-Mode Interface**:
   - Dataset selection mode: Lists available questions/data sources
   - Column management mode: Shows columns from selected data sources

2. **Key Features**:
   - Search functionality for finding questions
   - Compatibility filtering for visualization types
   - Drag-and-drop source for column mapping
   - Multiple data source support

3. **Column Management**:
   - Lists columns with appropriate metadata (type, name)
   - Draggable column items for mapping to wells
   - Visual feedback for column compatibility
   - Type-based icons for different data types

### VizSettingsSidebar Component

The `VizSettingsSidebar` provides configuration options for visualizations:

1. **Integration with Visualization Settings**:
   - Reuses core visualization settings widgets
   - Adapts available settings based on visualization type
   - Updates settings via Redux actions

2. **Implementation Details**:
   - Filters out inappropriate settings
   - Error handling for settings generation
   - Updates in real-time as settings change

3. **Settings Widgets**:
   - Generated dynamically based on visualization type
   - Include chart-specific options (axes, colors, legends)
   - Grouped by category for organization

### VisualizerModal Component

The `VisualizerModal` wraps the visualizer in a full-screen modal:

1. **Lifecycle Management**:
   - Initializes visualizer state when opened
   - Handles unsaved changes confirmation
   - Manages modal open/close states

2. **Initialization Logic**:
   - Supports initializing from existing card
   - Supports initializing from existing visualizer state
   - Extracts initial data sources from state

## Implementation Details

### Drag and Drop System

The visualizer uses `@dnd-kit/core` for its drag-and-drop functionality:

1. **Component Roles**:
   - `DndContext`: Wraps the entire interface to enable drag-and-drop
   - `useDraggable`: Applied to columns and well items
   - `useDroppable`: Applied to well components
   - `DragOverlay`: Provides visual feedback during drag

2. **Event Flow**:
   - `onDragStart`: Captures item being dragged
   - `onDragEnd`: Processes drop events and updates state
   - State updates trigger re-rendering with new mappings

3. **Implementation Details**:
   - Specialized measurement for vertical/horizontal items
   - Custom drag overlay rendering for different item types
   - Validation logic for acceptable drop targets

### UI State Management

The visualizer uses a combination of Redux and local state:

1. **Global State (Redux)**:
   - Visualization definition (type, settings)
   - Column mappings and data sources
   - Drag state for active operations

2. **Local UI State (Context)**:
   - Sidebar visibility
   - Current panel selections
   - UI-specific toggle states

3. **Performance Optimizations**:
   - Memoized calculations for derived data
   - Debounced search input
   - Selective re-rendering of components

### Responsive Design

The components use a flexible layout approach:

1. **Grid-Based Layout**:
   - Main container uses CSS grid for layout
   - Sidebar panels can be toggled open/closed
   - Canvas adapts to available space

2. **Sizing Strategies**:
   - Percentage-based sizing for major containers
   - Scrollable areas for overflowing content
   - Flexible wells that adapt to content

3. **Visual Feedback**:
   - Highlighting for drop targets
   - Visual cues for compatibility
   - Affordances for interactive elements

The visualizer UI is designed as a cohesive environment for visualization creation, with specialized components that work together to provide a user-friendly experience for mapping data to visual elements, while maintaining consistency with Metabase's overall design patterns.