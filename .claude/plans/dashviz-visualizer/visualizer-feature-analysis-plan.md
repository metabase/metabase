# Visualizer Feature Analysis Plan

This document outlines a focused approach to analyze and document the "visualizer" feature branch in Metabase. The analysis will examine the new dashboard card visualization type and its integration with the existing codebase.

A complete list of changed files in this feature branch can be found in `.claude/plans/dashviz-visualizer/visualizer-changed-files.txt`, which serves as a comprehensive reference for all modified or added files across the codebase. This file will be a critical resource during our analysis to understand the scope and structure of the feature changes.

## Analysis Objectives

1. Document the visualizer feature architecture and key components
2. Identify integration points with existing Metabase systems
3. Map user workflows and interaction patterns
4. Understand implementation patterns and design decisions

## Analysis Approach

Each step of analysis will produce a section in the final comprehensive document: `visualizer-feature-analysis.md`

Each section will include:

1. **Component Index**: Hierarchical structure of related files in the following format:
```
frontend/src/metabase/visualizer/
├── components/
│   ├── DataImporter/            # Data source selection components
│   │   ├── DataImporter.tsx     # Main data import controller
│   │   └── DatasetsList/        # List of available data sources
│   ├── VisualizationCanvas/     # Main visualization canvas components
│   └── VizSettingsSidebar/      # Visualization settings components
├── utils/                       # Utility functions
└── visualizer.slice.ts          # Redux state management
```

2. **Feature Summary**: Purpose, capabilities, and user workflows
3. **Key Components**: Core components and their interactions
4. **Implementation Details**: State management, data flow, and integration

## Analysis Steps

### Step 1: Core Architecture and Dashboard Integration

- Examine types in `frontend/src/metabase-types/api/visualizer.ts`
- Review `frontend/src/metabase/visualizer/visualizer.slice.ts` for state management
- Analyze dashboard integration in `frontend/src/metabase/dashboard/components/`
- Map how visualizer cards fit within the dashboard architecture

### Step 2: Main UI Components

- Analyze main visualizer container in `frontend/src/metabase/visualizer/components/Visualizer/`
- Examine visualization canvas in `frontend/src/metabase/visualizer/components/VisualizationCanvas/`
- Review well components (vertical/horizontal) for different chart types
- Document component hierarchy and responsibility boundaries

### Step 3: Data Handling and Transformation

- Analyze data import in `frontend/src/metabase/visualizer/components/DataImporter/`
- Review data transformation utilities in `frontend/src/metabase/visualizer/utils/`
- Document column mapping and data merging strategies
- Map the data flow from selection to visualization

### Step 4: Visualization Type Support

- Examine implementation for cartesian charts, pie charts, and funnels
- Analyze visualization-specific components and settings
- Review how core visualizations are adapted for the visualizer interface
- Document similarities and differences in visualization implementations

### Step 5: Settings and Customization

- Analyze settings sidebar in `frontend/src/metabase/visualizer/components/VizSettingsSidebar/`
- Review settings utilities in `frontend/src/metabase/visualizer/utils/viz-settings.ts`
- Document how visualization settings are managed and applied
- Map the settings structure and inheritance model

### Step 6: Interactive Features

- Analyze drag-and-drop in `frontend/src/metabase/visualizer/utils/drag-and-drop.ts`
- Review click actions in `frontend/src/metabase/visualizer/utils/click-actions.ts`
- Examine history/undo system in `frontend/src/metabase/visualizer/hooks/use-visualizer-history.ts`
- Document how interactive features enhance the user experience

### Step 7: Backend Integration

- Analyze backend changes in `src/metabase/api/dashboard.clj` and other Clojure files
- Review API interactions and data persistence
- Document serialization and data handling strategies
- Map frontend-backend communication patterns

### Step 8: Testing Strategy

- Examine E2E tests in `e2e/test/scenarios/dashboard/visualizer/`
- Review test data and fixtures
- Document test coverage and approaches for different visualizations
- Identify potential testing gaps or challenges

### Step 9: User Workflows and Experience

- Analyze the end-to-end user experience
- Document main user workflows and interactions
- Review error handling and edge cases
- Map the user journey through the visualizer interface

### Step 10: Performance and Future Considerations

- Analyze performance optimization techniques
- Identify potential bottlenecks or scalability concerns
- Document areas for future enhancement or extension
- Review compatibility with existing Metabase features

## Deliverable

The analysis will produce a single comprehensive document:

- **visualizer-feature-analysis.md**: Detailed reference documentation of the visualizer feature

This document will serve as a consolidated reference for understanding the visualizer feature, its implementation, and integration with existing Metabase components.

## Methodology

For each analysis step, we will:

1. **Reference changed files list**: Use `visualizer-changed-files.txt` to identify relevant files for each component
2. **Examine relevant code**: Review source files and test implementations
3. **Trace dependencies**: Identify component relationships and data flow
4. **Document patterns**: Capture implementation approaches and design decisions
5. **Map integration points**: Understand how visualizer connects with existing systems

## Success Criteria

The analysis will be considered successful when the consolidated document:

1. Provides a clear understanding of the visualizer feature architecture
2. Documents all major components and their interactions
3. Maps user workflows and interaction patterns
4. Identifies integration points with existing Metabase systems
5. Serves as a useful reference for future development and maintenance