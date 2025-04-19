Based on my analysis of the Metabase codebase, here's a comprehensive overview of the frontend architecture:

# Metabase Frontend Architecture

## Main Directories

1. **`/frontend/src/`**: Primary source code directory
   - `/metabase/`: Core application code
   - `/metabase-lib/`: Library code for query processing and metadata
   - `/metabase-types/`: TypeScript type definitions

2. **`/frontend/test/`**: Testing utilities and tests

3. **`/enterprise/frontend/`**: Enterprise edition features
   - Contains `/src/metabase-enterprise/` with EE-specific functionality
   - `/src/embedding-sdk/` for embedding capabilities

## Technology Stack

- **Framework**: React 18
- **State Management**: Redux and Redux Toolkit
- **Routing**: React Router 3 (older version)
- **UI Components**: Mantine UI library
- **Styling**: Mix of CSS modules, Emotion (CSS-in-JS), and Mantine styling
- **Visualization Libraries**: ECharts and D3
- **Build System**: Rspack (Webpack alternative)
- **Languages**: JavaScript and TypeScript (gradual migration)
- **Testing**: Jest for unit tests, Cypress for E2E tests

## Build Configuration

- **Config Files**:
  - `rspack.config.js`: Main build configuration using Rspack
  - `webpack.config.js`: Secondary configuration for specific builds
  - `babel.config.json`: JavaScript transpilation
  - `tsconfig.json`: TypeScript configuration
  - `postcss.config.js`: CSS processing

- **Entry Points**:
  - `app-main.js`: Standard application
  - `app-public.js`: Public pages
  - `app-embed.js`: Embedded views

- **Build Modes**:
  - Development with hot reload
  - Production with optimization

## Code Organization

- **Feature-based Structure**: Code is organized by features (dashboards, visualizations, etc.)
  
- **DashViz-related Code**:
  - `/frontend/src/metabase/visualizations/`: Core visualization components
  - `/frontend/src/metabase/dashboards/`: Dashboard-related code
  - `/frontend/src/metabase/components/`: Shared UI components

- **Component Pattern**:
  - Components typically have their own directory
  - TypeScript interfaces in separate files
  - Tests co-located with components
  - Index files for clean exports

## State Management

- Redux with Redux Toolkit
- State organized by domain/feature
- Actions, reducers, and selectors for each feature
- Typed state with TypeScript

## Visualization System

- Registry-based plugin system for visualizations
- Chart settings/options schema
- ECharts for rendering most chart types
- D3 for specialized visualizations
- Component skeletons for loading states

## Key Directories for DashViz Team

- `/frontend/src/metabase/visualizations/`: Core visualization components
- `/frontend/src/metabase/parameters/`: Dashboard filters and parameters
- `/frontend/src/metabase/dashboard/`: Dashboard components and state
- `/frontend/src/metabase/public/`: Public sharing and embedding
- `/frontend/src/metabase/subscriptions/`: Email and Slack subscriptions
- `/frontend/src/metabase/browse/`: Browsing UI for different data views

This organized frontend structure allows for the development of modular, maintainable visualization and dashboard components while providing a consistent user experience throughout the application.