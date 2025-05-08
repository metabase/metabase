# Frontend Codebase Analysis Plan

*Created: April 12, 2025*

## Instructions

This plan file tracks our progress in analyzing the Metabase frontend codebase. It serves both as a roadmap and as a record of completed work. The workflow is as follows:

1. When we complete a step in the plan, Claude will:
   - Check off the completed step in the checklist
   - Add a summary below the step with:
     - Key findings
     - Accomplishments
     - Future considerations

2. This file should be updated at the end of each analysis session.

3. If our conversation is interrupted or ended, you can have Claude read this file in a new session to continue where we left off.

4. As we learn more, we may adjust the plan by adding, modifying, or reprioritizing steps.

## Objective

To systematically analyze the Metabase frontend codebase using a top-down approach, identifying key patterns, structures, and workflows without performing exhaustive source code searches. This analysis will inform the creation of reference files and potential custom tools (MCP servers) that will make Claude more effective at answering frontend-related questions and assisting with frontend development tasks.

## Plan Checklist

### Phase 1: Architecture Mapping
- [x] Document high-level directory structure within frontend/
- [x] Identify application entry points and initialization flow
- [x] Map core technologies and major dependencies
- [x] Create a basic architectural diagram
- [x] Analyze build configuration and environment-specific code paths
- [x] Explore testing approach and test utilities
- [x] Phase 1 review and process check-in

#### Completed: Create a basic architectural diagram

**Key findings:**
- The frontend architecture follows a layered approach with clear separation of concerns
- State management is centralized with Redux, with specialized modules for different app features
- The UI layer uses a combination of Mantine components and custom abstractions

**Accomplishments:**
- Created a text-based architectural diagram showing the major components and their relationships
- Identified the data flow patterns in the application
- Mapped the component hierarchy and dependencies

**Diagram:**
```
+-----------------------------------------------------+
|                     PRESENTATION                     |
+-----------------------------------------------------+
|                                                     |
|  +-------------------+     +-------------------+    |
|  |   UI Components   |     |   Visualizations  |    |
|  | (Mantine/Custom)  |     | (ECharts/D3/etc)  |    |
|  +-------------------+     +-------------------+    |
|             |                       |               |
|             v                       v               |
|  +-------------------+     +-------------------+    |
|  |    Page Layouts   |     |  Shared Components|    |
|  | (Routes/Sections) |     |  (Common UI/HOCs) |    |
|  +-------------------+     +-------------------+    |
|                                                     |
+----------------------+----------------------------+--+
                       |
                       v
+----------------------+----------------------------+
|                 STATE MANAGEMENT                  |
+----------------------+----------------------------+
|                                                   |
|  +----------------+      +--------------------+   |
|  |  Redux Store   |<---->|  RTK Query Cache   |   |
|  +----------------+      +--------------------+   |
|    |          ^                                   |
|    |          |                                   |
|    v          |                                   |
|  +----------------+      +--------------------+   |
|  |   Actions &    |      |   Selectors &      |   |
|  |   Reducers     |      |   Derived State    |   |
|  +----------------+      +--------------------+   |
|                                                   |
+----------------------+----------------------------+
                       |
                       v
+----------------------+----------------------------+
|                 DATA SERVICES                     |
+----------------------+----------------------------+
|                                                   |
|  +----------------+      +--------------------+   |
|  |  API Services  |      |  Local Storage     |   |
|  | (RTK Endpoints)|      |  (Browser/Cookies) |   |
|  +----------------+      +--------------------+   |
|          |                                        |
|          v                                        |
|  +-------------------------------+                |
|  |      API Request/Response     |                |
|  |     (Middleware/Interceptors) |                |
|  +-------------------------------+                |
|                                                   |
+---------------------------------------------------+
                       |
                       v
+---------------------------------------------------+
|                  BACKEND API                       |
+---------------------------------------------------+
```

**Future considerations:**
- The diagram could be expanded to show specific feature modules and their interconnections
- A more detailed component hierarchy could be useful for developers
- Visualization paths could be documented separately due to their complexity

#### Completed: Explore testing approach and test utilities

**Key findings:**
- **Testing Frameworks:**
  - Jest for unit and integration testing
  - Cypress for end-to-end (E2E) testing
  - Testing Library for component testing
  - Loki for visual regression testing
  - Storybook for component documentation and testing

- **Testing Organization:**
  - Unit tests: Co-located with source files using `.unit.spec.{js,ts,jsx,tsx}` naming convention
  - E2E tests: Located in `/e2e/test/` directory with `.cy.spec.{js,ts}` naming convention
  - Test utilities and mocks: Located in `frontend/test/__support__` and `frontend/test/__mocks__`
  - Component tests: Using Testing Library with custom rendering utilities

- **Testing Utilities:**
  - Comprehensive test rendering utilities in `ui.tsx` that provide Redux, Router, and theme providers
  - Mock store utilities for entity state management
  - Custom matchers and testing helpers for common UI patterns
  - Mocks for browser APIs not available in the test environment (e.g., ResizeObserver)

- **Visual Testing:**
  - Loki configuration for visual regression testing of specific components
  - Focus on visualizations and key UI components for visual testing
  - Custom snapshot comparisons with tolerance settings

- **E2E Testing:**
  - Custom Cypress commands for common operations
  - Support for different environments (OSS vs. Enterprise)
  - CI-specific configuration with parallel test execution
  - Cross-version testing capabilities

**Accomplishments:**
- Identified testing patterns for different types of components
- Mapped the testing utility ecosystem for frontend components
- Discovered approaches for testing visualizations
- Understood how components are tested in isolation vs. integration

**Future considerations:**
- Visualization testing has specific approaches with mocked data
- Component testing utilities provide a good foundation for testing new visualizations
- Visual regression tests focus heavily on visualization components
- E2E tests provide real-world interaction patterns with visualization components

#### Completed: Analyze build configuration and environment-specific code paths

**Key findings:**
- **Build Systems:**
  - Dual build configuration with both Webpack and Rspack (Rust-based Webpack alternative)
  - Multiple entry points (`app-main.js`, `app-public.js`, `app-embed.js`) for different application contexts
  - Different build modes controlled by environment variables:
    - Development mode (default)
    - Production mode (`WEBPACK_BUNDLE=production`)
    - Hot reload mode (`WEBPACK_BUNDLE=hot`)

- **Environment Detection:**
  - Runtime environment detection via `env.ts` module
  - Environment variables exposed through webpack.EnvironmentPlugin
  - Feature flags controlled through environment variables:
    - `MB_EDITION`: Controls enterprise vs. open-source features (`ee` or `oss`)
    - `ENABLE_CLJS_HOT_RELOAD`: Enables ClojureScript hot reloading
    - `MB_LOG_ANALYTICS`: Controls analytics logging
    - `STORYBOOK`: Detects Storybook environment

- **Conditional Code Paths:**
  - Conditional imports based on environment using alias resolution:
    - `metabase-dev` resolves to `dev.js` or `dev-noop.js` based on environment
    - `ee-plugins`/`ee-overrides` resolves to actual code or empty module based on edition
  - Environment-specific optimizations:
    - Source map configuration varies by environment
    - Different bundling strategies for development vs. production
    - Hot module replacement only in development mode

- **Bundle Optimization:**
  - Code splitting strategy with separate vendor bundles
  - Specific bundles for heavy dependencies (sql-formatter, jspdf, html2canvas)
  - Minification in production mode using SWC/Terser
  - CSS extraction and optimization with different strategies per environment

**Accomplishments:**
- Identified how environment-specific features are toggled
- Mapped the build process flow for different scenarios
- Understood the optimization strategies for production builds
- Discovered how enterprise features are conditionally included

**Future considerations:**
- The build system is transitioning from Webpack to Rspack for better performance
- Visualization components have special handling with dedicated build configurations
- Multiple entry points enable embedding scenarios which affect visualization rendering
- Environment detection approach supports component reuse across contexts (main app, embedding, etc.)

#### Completed: Map core technologies and major dependencies

**Key findings:**
- **Core UI Framework:** 
  - React 18.2.0 as the primary UI library
  - Mantine UI (v7.17.0) as the component library framework
  - Emotion for CSS-in-JS styling (@emotion/react, @emotion/styled)
  - Custom UI component abstractions in `frontend/src/metabase/ui/components`

- **State Management:**
  - Redux with Redux Toolkit (RTK) for centralized state
  - RTK Query for API data fetching
  - Redux middleware including redux-promise
  - Custom Redux provider with context for embedding scenarios

- **Routing:**
  - React Router v3 (older version)
  - react-router-redux for integrating routing with Redux

- **Data Visualization:**
  - ECharts (v5.5.1) as the primary charting library
  - Visualization registry system with plugins
  - D3 (v7.9.0) for data transformations and specific visualizations
  - Leaflet for map visualizations

- **Utility Libraries:**
  - dayjs for date handling
  - Underscore.js for functional utilities
  - TypeScript for type safety (transitioning from JavaScript)
  - Formik and Yup for form handling and validation

- **Build Tools:**
  - Rspack (a Rust-based webpack alternative) for bundling
  - Babel and SWC for JavaScript/TypeScript transpilation
  - PostCSS for CSS processing

**Accomplishments:**
- Identified the complete stack of frontend technologies
- Understood the component library architecture
- Mapped visualization system approach
- Recognized the transitional state of the codebase (JS to TS, custom to Mantine)

**Future considerations:**
- The codebase shows signs of ongoing migration in several areas:
  - From JavaScript to TypeScript
  - From older React patterns to newer ones
  - From custom UI components to Mantine UI framework
- Multiple styling approaches exist (CSS modules, Emotion, Mantine's styling)
- Technical debt may exist in older patterns (React Router v3, redux-promise)

#### Completed: Identify application entry points and initialization flow

**Key findings:**
- The main application entry point is in `frontend/src/metabase/app-main.js`, which imports the initialization function from `app.js`
- The initialization process follows these steps:
  1. Import necessary libraries and styles
  2. Set up Redux store with appropriate reducers (`reducers-main.ts` and `reducers-common.ts`)
  3. Configure React Router with routes defined in `routes.jsx`
  4. Initialize analytics tracking
  5. Set up embedding capabilities
  6. Render the React application with necessary providers (Redux, EmotionCache, ThemeProvider)
  7. Register visualizations
  8. Initialize plugin functionality

- The application bootstrap data is loaded from an HTML element with ID `_metabaseBootstrap`, populated by the server
- Redux is used for state management with a combination of traditional reducers and Redux Toolkit
- React Router v3 is used for routing (older version)

**Accomplishments:**
- Mapped the initialization sequence of the frontend application
- Identified key files in the bootstrap process
- Understood the Redux store configuration and middleware setup
- Discovered the application's usage of RTK Query for API calls

**Future considerations:**
- The application uses a mix of older patterns (React Router v3) and newer ones (Redux Toolkit)
- There appears to be a transition from JavaScript to TypeScript in progress
- Multiple app entry points exist (app-main.js, app-public.js, app-embed.js) for different contexts

#### Completed: Document high-level directory structure within frontend/

**Key findings:**
- The frontend directory structure is organized into several main sections:
  - `frontend/lint/`: Contains ESLint rules and tests specific to the project
  - `frontend/src/`: Main source code, organized into:
    - `metabase-lib/`: Core library functionality
    - `metabase-shared/`: Shared components and utilities
    - `metabase-types/`: TypeScript type definitions organized by category (API, analytics, entities, etc.)
    - `metabase/`: Main application code with feature-specific subdirectories
    - `types/`: Global type declarations
  - `frontend/test/`: Test utilities, mocks, and test configurations

**Accomplishments:**
- Identified the primary code organization patterns
- Discovered that the codebase is a mix of JavaScript and TypeScript with a transition to TypeScript in progress
- Found key architectural hints in the main application files (App.tsx, app.js, app-main.js)

**Future considerations:**
- We should explore key subdirectories within `frontend/src/metabase/` to understand feature organization
- Need to investigate state management approach (Redux is used but need to understand the patterns)
- Should document the component library/UI framework approach (Mantine is being used)

## Phase 1 Completion Reference

The completion of Phase 1 has been documented in a compact log that summarizes our work so far. This log contains key technical concepts, files examined, and findings from our analysis of the frontend architecture.

**Reference:** `.claude/compact-logs/2025-04-13T04:39:53Z.txt`

This log file contains:
- Summary of the GitHub instructions reference creation
- Overview of the frontend codebase architecture exploration
- Key technical concepts identified in Phase 1
- List of files created and examined
- Problem-solving approaches established
- Current status and next steps

### Phase 2: Pattern Recognition
- [ ] Identify and document component patterns
- [ ] Analyze state management approach(es)
- [ ] Document routing and navigation patterns
- [ ] Explore internationalization implementation
- [ ] Investigate plugin system architecture
- [ ] Examine feature-specific state management patterns
- [ ] Catalog UI/UX patterns and common components
- [ ] Phase 2 review and process check-in

### Phase 3: Reference File Creation
- [ ] Create frontend architecture overview reference
- [ ] Document component hierarchy
- [ ] Create state management guide
- [ ] Document common UI patterns and idioms
- [ ] Phase 3 review and process check-in

### Phase 4: Tool Consideration
- [ ] Evaluate need for component finder MCP
- [ ] Consider dependency analyzer requirements
- [ ] Assess feasibility of state flow tracker
- [ ] Explore needs for TypeScript type explorer
- [ ] Phase 4 review and final process assessment

## Process Review

### What Worked Well

1. **Structured Documentation**
   - The three-part format (findings, accomplishments, future considerations) provided comprehensive documentation
   - Creating a dedicated plan file ensured we maintained progress tracking and context

2. **Reference File Separation**
   - Keeping high-level information in CLAUDE.md and detailed references in separate files maintained clear organization
   - This approach will make it easier to find information later

3. **Incremental Exploration**
   - Starting with high-level structure before diving into specifics helped build contextual understanding
   - Each completed step informed the next steps

4. **Plan Evolution**
   - We successfully adapted the plan based on discoveries, adding new steps as needed
   - The initial structure was flexible enough to accommodate new insights

### Improvement Opportunities

1. **Execution vs. Planning Clarity**
   - Need clearer delineation between planning discussions and execution phases
   - Being more explicit about "now we're planning" vs. "now we're executing" would help

2. **Output Format Alignment**
   - Discussing preferred output formats before starting work (like the ASCII diagram issue)
   - Avoiding assumptions about what's useful for both AI and human collaboration

3. **Scope Definition**
   - Some steps could have been better scoped with clearer definitions of "completion"
   - More granular tasks might be easier to execute and verify

4. **Verification Mechanism**
   - Adding explicit verification points between steps
   - More questions like "does this look right?" before proceeding

## Step Execution Process

For all remaining steps, we'll use the following check-in/check-out process:

1. **Check-in**: Before starting a step, explicitly announce:
   - Which step is being started
   - The approach that will be used
   - Any clarification questions about the step

2. **Execution**: During the step:
   - Focus only on the current step
   - Share progress updates for complex steps
   - Ask for guidance if encountering unexpected challenges

3. **Check-out**: After completing a step:
   - Summarize findings using the established format
   - Validate whether the step is truly complete
   - Update the plan document with the completed step

## Progress Log

*This section will be populated as steps are completed.*