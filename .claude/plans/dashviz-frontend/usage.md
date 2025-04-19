# Frontend Code Analysis Usage Statistics

## Phase 6.2: Performance Optimization Techniques

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/dashboard/actions/data-fetching.ts`
- `/frontend/src/metabase/data-grid/hooks/use-virtual-grid.tsx`
- `/frontend/src/metabase-lib/v1/utils/memoize-class.ts`
- `/frontend/src/metabase/data-grid/components/DataGrid/DataGrid.tsx`
- `/frontend/src/metabase/visualizations/components/Visualization/Visualization.tsx`
- `/frontend/src/metabase/visualizations/visualizations/CartesianChart/CartesianChart.tsx`
- `/frontend/src/metabase/visualizations/visualizations/RowChart/RowChart.tsx`
- `/frontend/src/metabase/visualizations/visualizations/PieChart/PieChart.tsx`
- `/frontend/src/metabase/dashboard/components/Dashboard/Dashboard.tsx`
- Various memoization and performance-related files

### Total Count
- Number of files examined: ~15 files
- Lines of code reviewed: ~2500 lines

### Tools Used
- Dispatch agent
- Code search (GrepTool)
- File viewing (BatchTool)

### Resource Consumption
- Time taken: ~6-7 minutes
- Tokens used: ~18,000 tokens (estimate)

### Key Findings
- Comprehensive memoization strategies at class, component, and calculation levels
- Sophisticated data fetching with intelligent caching and request cancellation
- Virtualization for efficiently rendering large datasets in tables and grids
- Parallel data loading for dashboard cards with progress tracking
- Performance monitoring for slow-loading cards
- Debounced and throttled updates for responsive UI
- Progressive loading states and indicators
- Careful resource management to prevent memory leaks

## Phase 6.1: Visualization Testing Patterns

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/visualizations/BarChart.unit.spec.tsx`
- `/frontend/src/metabase/visualizations/components/Visualization/Visualization-themed.unit.spec.tsx`
- `/e2e/test/scenarios/visualizations-charts/bar_chart.cy.spec.js`
- `/frontend/src/metabase/visualizations/visualizations/PieChart/PieChart.stories.tsx`
- `/docs/developers-guide/visual-tests.md`
- `/loki.config.js`
- `/frontend/test/register-visualizations.js`
- Various unit test files under `/frontend/src/metabase/visualizations/`
- Various Cypress test files under `/e2e/test/scenarios/visualizations-charts/` and `/e2e/test/scenarios/visualizations-tabular/`

### Total Count
- Number of files examined: ~20 files
- Lines of code reviewed: ~2000 lines

### Tools Used
- Dispatch agent
- Code search (GlobTool)
- File viewing (BatchTool)

### Resource Consumption
- Time taken: ~5-6 minutes
- Tokens used: ~16,000 tokens (estimate)

### Key Findings
- Multi-layered testing approach with unit, integration, and visual tests
- Unit tests using Jest for components and utility functions
- Comprehensive end-to-end tests using Cypress
- Visual regression testing with Loki and Storybook
- Specialized test helpers for visualization interactions
- Mock factories for creating test datasets
- Extensive testing of edge cases like null values and extreme numbers
- Testing for theme integration and accessibility
- CI workflow for automating visual regression testing

## Phase 5.3: Theming and Styling System

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/lib/colors/palette.ts`
- `/frontend/src/metabase/css/core/colors.module.css`
- `/frontend/src/metabase/lib/colors/charts.ts`
- `/frontend/src/metabase/lib/colors/groups.ts`
- `/frontend/src/metabase/ui/theme.ts`
- `/frontend/src/metabase/visualizations/components/settings/ChartSettingColorPicker/ChartSettingColorPicker.tsx`
- `/frontend/src/metabase/visualizations/shared/utils/colors.ts`
- `/frontend/src/metabase/visualizations/shared/utils/theme.ts`
- `/frontend/src/metabase/visualizations/echarts/cartesian/option/axis.ts`
- `/frontend/src/metabase/embedding-sdk/theme/default-component-theme.ts`
- `/frontend/src/metabase/embedding-sdk/theme/MetabaseTheme.ts`

### Total Count
- Number of files examined: 11 files
- Lines of code reviewed: ~1500 lines

### Tools Used
- Dispatch agent
- Code search (GrepTool)
- File viewing (BatchTool)

### Resource Consumption
- Time taken: ~4-5 minutes
- Tokens used: ~14,000 tokens (estimate)

### Key Findings
- Comprehensive color system with semantic variables and base palette
- CSS variables-based theming with modern color-mix functionality
- Dark mode support through themed CSS classes
- Accessibility features including text contrast calculation
- ECharts visualization theming integration
- Smart color assignment system for chart elements
- Multiple styling approaches: CSS modules, styled components, Mantine UI
- Embedding SDK with extensive theming customization options
- Font sizing system with relative units for better scaling

## Phase 5.2: Custom Visualization Extensions

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/index.ts`
- `/frontend/src/metabase/visualizations/types/visualization.ts`
- `/frontend/src/metabase/visualizations/register.js`
- `/frontend/src/metabase/visualizations/visualizations/PieChart/chart-definition.ts`
- `/frontend/src/metabase/plugins/index.ts`
- `/frontend/src/metabase/plugins/builtin.js`
- `/frontend/src/metabase/static-viz/register.js`
- `/enterprise/frontend/src/metabase-enterprise/audit_app/components/AuditTableVisualization/AuditTableVisualization.jsx`

### Total Count
- Number of files examined: 8 files
- Lines of code reviewed: ~1000 lines

### Tools Used
- Dispatch agent
- Code search (GlobTool)
- File viewing (BatchTool)

### Resource Consumption
- Time taken: ~3-4 minutes
- Tokens used: ~12,000 tokens (estimate)

### Key Findings
- Registry-based architecture for visualization components
- Clearly defined VisualizationDefinition interface for extending visualizations
- Component + definition pattern for creating custom visualizations
- Enterprise-specific visualizations using the same extension patterns
- Static visualization subset for exports and embedding
- Settings system for configuring visualization behavior and appearance
- Plugin system that could potentially be used for visualizations extensions

## Phase 5.1: Visualization Export and Sharing

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/lib/save-dashboard-pdf.ts`
- `/frontend/src/metabase/visualizations/lib/save-chart-image.ts`
- `/frontend/src/metabase/query_builder/components/QuestionDownloadWidget/use-download-data.ts`
- `/frontend/src/metabase/public/lib/embed.ts`
- `/frontend/src/metabase/public/components/EmbedModal/EmbedModal.tsx`
- `/frontend/src/metabase/notifications/DashboardSubscriptionsSidebar/DashboardSubscriptionsSidebar.jsx`
- `/frontend/src/metabase/query_builder/components/QuestionDownloadPopover/QuestionDownloadPopover.tsx`
- `/frontend/src/metabase/redux/downloads.ts`
- `/frontend/src/metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard.tsx`

### Total Count
- Number of files examined: ~10 files
- Lines of code reviewed: ~1200 lines

### Tools Used
- Dispatch agent
- Code search (GlobTool)
- File viewing (BatchTool)

### Resource Consumption
- Time taken: ~4-5 minutes
- Tokens used: ~13,000 tokens (estimate)

### Key Findings
- PDF export using html2canvas and jspdf with intelligent page breaking
- PNG image export with high-resolution settings
- Data export in multiple formats (CSV, XLSX, JSON)
- Dashboard subscription system for email and Slack delivery
- Secure embedding system with JWT token authentication
- Public link sharing with specialized API endpoints
- Different export paths based on resource type and access method
- UI components for download options and subscription management
- Redux-based download state management for tracking progress

## Phase 4.3: Real-time Updates and Subscriptions

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/dashboard/hooks/use-dashboard-refresh-period.ts`
- `/frontend/src/metabase/dashboard/hooks/use-interval.ts`
- `/frontend/src/metabase/dashboard/components/RefreshWidget/RefreshWidget.tsx`
- `/frontend/src/metabase/lib/pulse.ts`
- `/frontend/src/metabase/api/subscription.ts`
- `/frontend/src/metabase/entities/pulses.js`
- `/frontend/src/metabase/notifications/modals/components/NotificationChannelsPicker.tsx`
- `/frontend/src/metabase/admin/settings/notifications/WebhookForm.tsx`
- `/frontend/src/metabase/notifications/modals/CreateOrEditQuestionAlertModal/components/NotificationSchedule/NotificationSchedule.tsx`

### Total Count
- Number of files examined: ~9 files
- Lines of code reviewed: ~1000 lines

### Tools Used
- Dispatch agent
- Code search (GlobTool)
- File viewing (BatchTool)

### Resource Consumption
- Time taken: ~4-5 minutes
- Tokens used: ~12,000 tokens (estimate)

### Key Findings
- Dashboard auto-refresh system using customizable intervals (1-60 minutes)
- Comprehensive subscription system supporting email, Slack, and webhook channels
- Flexible scheduling options including hourly, daily, weekly, monthly, and custom
- Webhook integration with multiple authentication methods
- Alert notification system with safeguards against excessive checks
- Performance optimizations in timer management and cleanup
- Modern state management using Redux RTK Query

## Phase 4.2: Data Loading and Error States

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/components/Visualization/Visualization.tsx`
- `/frontend/src/metabase/visualizations/components/Visualization/LoadingView/LoadingView.tsx`
- `/frontend/src/metabase/dashboard/actions/data-fetching.ts`
- `/frontend/src/metabase/visualizations/components/Visualization/ErrorView/ErrorView.tsx`
- `/frontend/src/metabase/visualizations/components/skeletons/VisualizationSkeleton/VisualizationSkeleton.tsx`
- `/frontend/src/metabase/visualizations/components/ChartRenderingErrorBoundary/ChartRenderingErrorBoundary.tsx`
- `/frontend/src/metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper.tsx`
- `/frontend/src/metabase/dashboard/hooks/use-refresh-dashboard.ts`

### Total Count
- Number of files examined: ~10 files
- Lines of code reviewed: ~1500 lines

### Tools Used
- Dispatch agent
- Code search (GlobTool)
- File viewing (BatchTool)

### Resource Consumption
- Time taken: ~4-5 minutes
- Tokens used: ~12,000 tokens (estimate)

### Key Findings
- Comprehensive loading state management with specialized components
- Slow query detection with feedback for long-running queries
- Skeleton UI components that match visualization types
- Multi-layered error handling with error boundaries
- Efficient caching system with cache invalidation on parameter changes
- Request cancellation to avoid race conditions
- Dashboard-wide loading progress tracking
- Performance optimizations including memoization and selective updates

## Phase 4.1: Click Behavior and Drill-Through

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/click-actions/Mode/Mode.ts`
- `/frontend/src/metabase/visualizations/lib/action.js`
- `/frontend/src/metabase/visualizations/components/ClickActions/ClickActionsPopover.tsx`
- `/frontend/src/metabase/visualizations/components/ClickActions/ClickActionsView.tsx`
- `/frontend/src/metabase/querying/drills/utils/query-drill.ts`
- `/frontend/src/metabase/querying/drills/utils/constants.ts`
- `/frontend/src/metabase/dashboard/components/ClickBehaviorSidebar/ClickBehaviorSidebar.tsx`
- `/frontend/src/metabase/querying/drills/utils/underlying-records-drill.ts`
- Various click action components and utilities

### Total Count
- Number of files examined: ~15 files
- Lines of code reviewed: ~1200 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~4-5 minutes
- Tokens used: ~13,000 tokens (estimate)

### Key Findings
- Flexible click action system with three main action types: question change, URL navigation, and Redux actions
- Comprehensive drill-through system with 17+ drill types for data exploration
- Custom click behavior configuration for dashboards, including links and cross-filtering
- Mode-based architecture that determines available actions based on context
- UI components for displaying and selecting actions (ClickActionsPopover)
- Extension points for adding custom drill types and behaviors
- Integration with embedding SDK for customizing click behaviors in embedded dashboards

## Phase 3.3: Dashboard Layout and Responsiveness

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/dashboard/components/DashboardGrid.tsx`
- `/frontend/src/metabase/dashboard/components/grid/GridLayout.tsx`
- `/frontend/src/metabase/dashboard/grid-utils.ts`
- `/frontend/src/metabase/dashboard/components/grid/utils.ts`
- `/frontend/src/metabase/visualizations/shared/utils/sizes.ts`
- `/frontend/src/metabase/lib/dashboard_grid.js`
- `/frontend/src/metabase/dashboard/components/DashboardGrid.module.css`
- Various dashboard component files and utilities

### Total Count
- Number of files examined: ~10 files
- Lines of code reviewed: ~1000 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~4-5 minutes
- Tokens used: ~12,000 tokens (estimate)

### Key Findings
- Grid-based layout system using react-grid-layout
- 24-column desktop grid that collapses to a single column on mobile
- Responsive breakpoint at 752px width for desktop/mobile transition
- Visualization-specific minimum and default sizes
- Mobile heights calculated based on visualization type
- Dynamic row height calculation to maintain aspect ratio
- Fixed-width and fluid dashboard options
- Automatic positioning algorithm for new cards
- SVG-based grid backgrounds for editing mode

## Phase 3.2: Filters and Parameters

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase-types/api/dashboard.ts`
- `/frontend/src/metabase/parameters/utils/mapping-options.ts`
- `/frontend/src/metabase-lib/v1/parameters/utils/filters.ts`
- `/frontend/src/metabase-lib/v1/parameters/utils/click-behavior.ts`
- `/frontend/src/metabase/parameters/components/ParameterWidget/ParameterWidget.tsx`
- `/frontend/src/metabase/parameters/components/ParameterValueWidget.tsx`
- `/frontend/src/metabase/parameters/components/widgets/StringInputWidget/StringInputWidget.tsx`
- `/frontend/src/metabase/dashboard/actions/data-fetching.ts`
- `/frontend/src/metabase-lib/v1/parameters/utils/parameter-values.js`
- `/frontend/src/metabase/parameters/utils/linked-filters.js`
- Various parameter widget implementations and utilities

### Total Count
- Number of files examined: ~18 files
- Lines of code reviewed: ~2000 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~5-6 minutes
- Tokens used: ~16,000 tokens (estimate)

### Key Findings
- Comprehensive parameter system with clear separation of concerns
- Type-based compatibility matching between parameters and fields/variables
- Specialized UI widgets for different parameter types
- Parameter mapping system connecting dashboard parameters to question fields/variables
- Cross-filtering implementation for interactive dashboards
- Parameter value normalization and serialization patterns
- Linked parameters for hierarchical filtering

## Phase 3.1: Dashboard Card Components

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/dashboard/components/DashCard/DashCard.tsx`
- `/frontend/src/metabase/dashboard/components/DashCard/DashCardVisualization.tsx`
- `/frontend/src/metabase/visualizations/components/Visualization/Visualization.tsx`
- `/frontend/src/metabase/visualizations/visualizations/BarChart/BarChart.tsx`
- `/frontend/src/metabase/visualizations/visualizations/CartesianChart/CartesianChart.tsx`
- `/frontend/src/metabase/dashboard/components/DashCard/DashCardParameterMapper/DashCardParameterMapper.jsx`
- `/frontend/src/metabase/dashboard/components/DashCard/DashCardParameterMapper/DashCardCardParameterMapper.tsx`
- `/frontend/src/metabase/dashboard/utils.js`
- `/frontend/src/metabase/dashboard/selectors.js`

### Total Count
- Number of files examined: ~15 files
- Lines of code reviewed: ~1800 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~4-5 minutes
- Tokens used: ~14,000 tokens (estimate)

### Key Findings
- Layered component architecture connecting dashboards to visualizations
- Bridge component (DashCardVisualization) connects dashboard context to visualization system
- Consistent pattern of extending card data with dashboard-specific settings
- Parameter mapping system to connect dashboard filters to card visualizations
- Support for multi-series cards in dashboards
- Responsive design patterns to adapt visualizations to dashboard grid

## Phase 2.3: Settings State Management

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/lib/settings/` directory
- Settings state management utilities and functions
- Redux actions and reducers for visualization settings
- Visualization component update patterns

### Total Count
- Number of files examined: ~15 files
- Lines of code reviewed: ~1400 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~3-4 minutes
- Tokens used: ~13,000 tokens (estimate)

### Key Findings
- Hierarchical storage in card.visualization_settings property
- Multi-level inheritance (global defaults → visualization defaults → user settings)
- Immutable update patterns for settings changes
- Dependency tracking between related settings
- Optimization techniques including memoization and derived state
- Clear data flow from storage to display and from user changes back to storage

## Phase 2.2: Settings UI Components

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/components/settings/` directory
- Widget components for different setting types
- Error handling and validation components
- Widget generation and registration systems

### Total Count
- Number of files examined: ~20 files
- Lines of code reviewed: ~1600 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~3-4 minutes
- Tokens used: ~12,000 tokens (estimate)

### Key Findings
- Modular UI component system with specialized widgets for different setting types
- Comprehensive widget types: toggles, inputs, selectors, color pickers, field pickers
- Multi-level validation system from component to visualization level
- Organization patterns including section-based grouping and progressive disclosure
- Interaction patterns for immediate vs. deferred updates and cascading changes
- Consistent props interface across widget components

## Phase 2.1: Settings Schema Architecture

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/lib/settings/` directory
- Settings definition files for different visualization types
- Common settings modules and helpers
- Settings processing and computation utilities

### Total Count
- Number of files examined: ~15 files
- Lines of code reviewed: ~1800 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~4-5 minutes
- Tokens used: ~15,000 tokens (estimate)

### Key Findings
- Hierarchical settings architecture with declarative schema definitions
- Powerful default value system with static, dynamic, and contextual defaults
- Dependency management between settings with readDependencies and writeDependencies
- Multi-stage processing pipeline for computing final settings values
- Validation system to ensure settings are appropriate for the data
- Organization by visualization type, section, context, and feature

## Phase 1.3: Chart Types Implementation

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/visualizations/` directory
- Implementation files: `PieChart.tsx`, `LineChart.tsx`, `BarChart.tsx`, `Table.jsx`
- Chart models: `getPieChartModel`, `getCartesianChartModel`
- Chart options: `getPieChartOption`, `getCartesianChartOption`
- Various chart definition files and utilities

### Total Count
- Number of files examined: ~20 files
- Lines of code reviewed: ~2000 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~4-6 minutes
- Tokens used: ~16,000 tokens (estimate)

### Key Findings
- Consistent architecture with separation of chart definition, model creation, and rendering
- ECharts is used for rendering modern visualizations with specific option generation
- Chart inheritance pattern where similar charts share base components (e.g., CartesianChart)
- Comprehensive settings system with dependencies between settings
- Chart-specific data transformations tailored to each visualization type

## Phase 1.2: Base Visualization Components

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/components/Visualization/Visualization.tsx`
- `/frontend/src/metabase/visualizations/components/ChartWithLegend.jsx`
- `/frontend/src/metabase/visualizations/components/LoadingView.jsx`
- `/frontend/src/metabase/visualizations/components/ErrorView.jsx`
- `/frontend/src/metabase/visualizations/components/NoResultsView.jsx`
- `/frontend/src/metabase/visualizations/components/ClickActionsPopover.jsx`
- Various chart definition files and hooks

### Total Count
- Number of files examined: ~12 files
- Lines of code reviewed: ~1200 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~3-5 minutes
- Tokens used: ~14,000 tokens (estimate)

### Key Findings
- Central `Visualization` component orchestrates rendering of specific chart types
- Component lifecycle uses derived state for efficient updates
- Standardized interactive behavior for clicks and hovers
- Reusable components for common visualization elements
- Consistent error handling and loading states

## Phase 1.1: Visualization Registry & Plugin System

Date: April 18, 2025

### Files Examined
- `/frontend/src/metabase/visualizations/index.ts`
- `/frontend/src/metabase/visualizations/register.js`
- `/frontend/src/metabase/visualizations/types/visualization.ts`
- `/frontend/src/metabase/visualizations/components/Visualization/Visualization.tsx`
- `/frontend/src/metabase/visualizations/echarts/index.ts`
- Various visualization components (Scalar, etc.)

### Total Count
- Number of files examined: ~15 files
- Lines of code reviewed: ~1500 lines

### Tools Used
- Dispatch agent
- Code search
- File viewing

### Resource Consumption
- Time taken: ~3-5 minutes
- Tokens used: ~15,000 tokens (estimate)

### Key Findings
- Registry-based architecture for visualization components
- Well-defined interfaces for visualization components
- ECharts integration for many chart types
- Component-based architecture with clear composition patterns


> /cost
  ⎿  Total cost:            $20.12
     Total duration (API):  1h 10m 33.5s
     Total duration (wall): 2h 31m 38.8s
     Total code changes:    6904 lines added, 192 lines removed
claude_code_key_tyler_oqbo
tokens in: 30,345,395
tokens out: 205,870
(this is before i ask it to reduce our files)
