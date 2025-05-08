# DashViz Backend Analysis Plan

This document outlines a systematic approach to analyze and document the backend systems that support the DashViz team's responsibilities in Metabase. The analysis will focus on the Clojure codebase that handles dashboard and visualization functionality.

## Analysis Objectives

1. Create comprehensive documentation of backend visualization systems
2. Identify core components and their interactions
3. Map data flows from query execution to visualization rendering
4. Document parameter handling and dashboard subscription systems
5. Catalog testing infrastructure for visualization components
6. Identify enterprise-specific extensions

## Analysis Workflow

The analysis will follow this structured workflow:

1. **Step-by-Step Approach**: We will go through each step in the plan one at a time, completing each step fully before moving to the next.

2. **Summary Reference Documents**: After analyzing each step, a summary reference document will be created at `.claude/plans/dashviz-backend/step-[number]-[name].md` (e.g., `.claude/plans/dashviz-backend/step-10-card-rendering.md`).

3. **Document Structure**: Each summary file will follow this standardized structure:

   **A. File Index**
   - A hierarchical 'index' of the relevant areas of the codebase (as shown below)

   **B. Summary**
   - Overall purpose and functionality
   - Core concept being abstracted
   - Primary responsibilities and capabilities

   **C. Dependencies**
   - **Upstream Dependencies**: What this component depends on (both internal and 3rd party)
   - **Downstream Dependencies**: What depends on this component

   **D. Key Data Structures**
   - Brief descriptions of primary records, protocols, and data formats
   - Purpose and significance of each structure
   - Relationship between structures

   **E. Core Functions**
   - List of most important functions with signatures
   - Purpose and role of each function
   - Common usage patterns

   **F. Configuration Points**
   - Settings, environment variables, or configuration options
   - Default values and override mechanisms

   **G. Enterprise Extensions**
   - Where enterprise features extend or modify functionality
   - Extension points in the open-source code

   **H. Testing Approach**
   - How the component is tested
   - Key test fixtures and utilities
   - Test coverage considerations

   **I. Error Handling**
   - How errors are managed and reported
   - Recovery mechanisms
   - Common failure modes

4. **Codebase Index Format**: Each summary will begin with a hierarchical file structure in this format:

```
src/metabase/channel/render/
├── card.clj                 # Card visualization rendering
├── js/
│   ├── svg.clj              # SVG generation using JavaScript
│   └── engine.clj           # JavaScript execution environment
├── png.clj                  # PNG conversion utilities
└── table.clj                # Table formatting for emails
```

## Analysis Phases

The analysis will be divided into 6 phases, each focusing on a specific aspect of the backend architecture. Each phase will produce detailed documentation for the relevant components.

### Phase 1: Core Data Models

**Step 1**: Analyze Dashboard and Card Models
- Examine `models/dashboard.clj`, `models/card.clj`, and related models
- Document schema, relationships, and key functions
- Identify core data structures for visualizations
- Map model relationships and dependencies

**Step 2**: Analyze Dashboard Card and Series Models
- Examine `models/dashboard_card.clj` and related card series models
- Document how cards are organized on dashboards
- Identify visualization settings storage and validation
- Map relationships between dashboards, cards, and series

**Step 3**: Analyze Dashboard Tabs and Organization
- Examine `models/dashboard_tab.clj` and related organization models
- Document how dashboards are organized into tabs
- Identify tab-specific configuration and behavior

### Phase 2: Query Processor and Results Formatting

**Step 4**: Analyze Dashboard Query Processing
- Examine `query_processor/dashboard.clj` and related components
- Document how dashboard queries are processed
- Identify middleware components that transform queries
- Map the query execution pipeline for dashboards

**Step 5**: Analyze Results Formatting
- Examine query result formatting for different visualization types
- Document how raw data is prepared for visualization
- Identify type-specific transformations and formatting
- Map data flow from query results to visualization inputs

**Step 6**: Analyze Query Caching and Performance
- Examine caching strategies for dashboard queries
- Document how results are cached and invalidated
- Identify performance optimization techniques
- Map caching infrastructure for visualizations

### Phase 3: Parameter System

**Step 7**: Analyze Parameter Models and Validation
- Examine `models/params.clj` and related parameter models
- Document parameter types, validation, and storage
- Identify parameter mapping and resolution
- Map the parameter definition system

**Step 8**: Analyze Parameter Resolution in Queries
- Examine how parameters are applied to queries
- Document parameter translation for different query types
- Identify parameter value sourcing and defaults
- Map parameter flow from dashboard to executed query

**Step 9**: Analyze Chain Filtering and Dependencies
- Examine `models/params/chain-filter.clj` and related components
- Document how dependent parameters work
- Identify the infrastructure for parameter dependencies
- Map the chain filtering execution flow

### Phase 4: Visualization Rendering

**Step 10**: Analyze Card Rendering System
- Examine `channel/render/card.clj` and related rendering components
- Document how visualizations are rendered for different outputs
- Identify rendering strategies for different visualization types
- Map the rendering pipeline from data to visual output

**Step 11**: Analyze SVG/PNG Generation
- Examine `channel/render/js/svg.clj`, `channel/render/png.clj`, and related components
- Document how charts are rendered as SVG/PNG
- Identify JavaScript integration for visualization rendering
- Map the image generation pipeline

**Step 12**: Analyze Table and Text Formatting
- Examine `channel/render/table.clj` and text formatting components
- Document how tabular data is formatted for display
- Identify specialized formatting for different data types
- Map the table rendering pipeline

### Phase 5: Dashboard Subscriptions and Export

**Step 13**: Analyze Dashboard Subscription System
- Examine `pulse/dashboard_subscription.clj` and related components
- Document how dashboard subscriptions work
- Identify scheduling and delivery mechanisms
- Map the subscription execution flow

**Step 14**: Analyze Email and Slack Delivery
- Examine `pulse/send.clj`, `channel/impl/email.clj`, `channel/impl/slack.clj`
- Document how visualizations are formatted for email/Slack
- Identify channel-specific considerations
- Map the delivery pipeline from rendering to sending

**Step 15**: Analyze Export Functionality
- Examine export-related components for dashboard/card data
- Document export formats and generation
- Identify export-specific transformations
- Map the export pipeline from data to file generation

### Phase 6: API Endpoints and Integration

**Step 16**: Analyze Dashboard and Card API Endpoints
- Examine `api/dashboard.clj`, `api/card.clj`, and related API endpoints
- Document API structure and functionality
- Identify permission checks and validation
- Map the API surface exposed to the frontend

**Step 17**: Analyze Enterprise Extensions
- Examine enterprise-specific dashboard and visualization features
- Document enterprise-only capabilities
- Identify extension points in the open-source codebase
- Map enterprise feature integration with core components

## Deliverables

1. **Individual Step Summaries**: 17 summary documents, one for each step in the plan, named according to the pattern `step-[number]-[name].md`

2. **Consolidated Documents**:
   - **backend-dashviz.md**: Comprehensive documentation of backend visualization systems
   - **backend-params.md**: Detailed documentation of parameter handling system
   - **backend-subscriptions.md**: Documentation of dashboard subscription and delivery system

3. **Completion Summary**: `dashviz-backend-analysis-plan-completion.md` with summary of findings and completion status

## Timeline

Each step is expected to take approximately 1-2 hours of analysis time. The entire plan is estimated to take approximately 20-30 hours of work spread across multiple sessions.

## Methodology

For each step in the analysis plan, we will:

1. **Explore the Codebase**:
   - Examine source code and associated tests
   - Trace component dependencies and integrations
   - Identify key functions and data structures

2. **Create Documentation**:
   - Write a summary document following the structure outlined in the workflow
   - Include a hierarchical index of relevant code
   - Document key functions with their purpose and parameters
   - Map data flows and transformations
   - Note enterprise-specific extensions

3. **Verify Completeness**:
   - Ensure all aspects of the component are covered
   - Verify accuracy of function descriptions and workflows
   - Check that integration points with other components are documented

## Success Criteria

The analysis will be considered successful when:

1. All 17 steps in the plan have been completed with individual summary documents
2. Each summary document includes all required sections:
   - File Index (hierarchical codebase structure)
   - Summary (purpose and concept)
   - Dependencies (upstream and downstream)
   - Key Data Structures
   - Core Functions
   - Configuration Points
   - Enterprise Extensions
   - Testing Approach
   - Error Handling

3. The consolidated documents provide a comprehensive view of:
   - Backend visualization architecture
   - Parameter handling system
   - Dashboard subscription and delivery system

4. The analysis provides sufficient reference material to answer questions about the backend visualization systems