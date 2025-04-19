# Metabase Frontend Architecture

This document provides a detailed reference of the Metabase frontend architecture. It serves as a guide when answering questions about frontend code organization, component relationships, and implementation patterns.

## Core Technology Stack

### Primary Technologies
- **React 18** - UI rendering library
- **Redux + Redux Toolkit** - State management
- **TypeScript** - Type safety (in transition from JavaScript)
- **Mantine UI v7** - Component library and design system
- **React Router v3** - Routing (older version)
- **Emotion** - CSS-in-JS styling

### Visualization Technologies
- **ECharts** - Primary charting library
- **D3** - Data transformation and specific visualizations
- **Leaflet** - Map visualizations

### Build Tools
- **Rspack** - Rust-based Webpack alternative for bundling
- **Babel/SWC** - JavaScript/TypeScript transpilation
- **PostCSS** - CSS processing

## Directory Structure

The frontend code is primarily organized in the following directories:

- `frontend/src/metabase-lib/` - Core library functionality
- `frontend/src/metabase-shared/` - Shared components and utilities
- `frontend/src/metabase-types/` - TypeScript type definitions by category
- `frontend/src/metabase/` - Main application code 
- `frontend/src/types/` - Global type declarations
- `frontend/test/` - Test utilities and mocks

## Application Entry Points

The main entry point is `frontend/src/metabase/app-main.js`, which imports the initialization function from `app.js`. Other specialized entry points include:

- `app-embed.js` - For embedded visualizations
- `app-public.js` - For public-facing pages

## Application Initialization Sequence

1. Import necessary libraries, styles, and plugins
2. Set up Redux store with appropriate reducers
3. Configure React Router with routes from `routes.jsx`
4. Initialize analytics tracking
5. Set up embedding capabilities
6. Render React application with necessary providers
7. Register visualizations
8. Initialize plugins

## State Management

The application uses Redux with Redux Toolkit for state management:

- **Reducers** - Combined in `reducers-main.ts` and `reducers-common.ts`
- **Actions** - Mix of traditional action creators and RTK slices
- **Selectors** - Used for derived state with reselect
- **Middleware** - Includes redux-promise, router middleware, and RTK Query middleware
- **RTK Query** - Used for API data fetching with caching

## Component Architecture

UI components follow a hierarchical organization:

- **Base UI Components** - Wrappers around Mantine components in `ui/components/`
- **Feature Components** - Specific to application features
- **Containers** - Connected to Redux state
- **Layouts** - Page structure and organization
- **Visualizations** - Chart and graph components using ECharts/D3

## Code Transition Patterns

The codebase shows signs of ongoing migrations:

- JavaScript → TypeScript conversion
- Class components → Functional components with hooks
- Custom UI components → Mantine UI framework
- Redux → Redux Toolkit + RTK Query 

## Import Patterns to Note

- Direct imports from `metabase/lib/` for utility functions
- Component imports from `metabase/components/` for shared components
- Type imports from `metabase-types/`
- Redux state access via selectors in `metabase/selectors/`
- UI components imported from `metabase/ui/components/`

## Common Design Patterns

- **HOCs** - Higher-order components for cross-cutting concerns
- **Hooks** - Custom hooks in `metabase/hooks/`
- **Context Providers** - For theme, localization, etc.
- **Component Composition** - Building complex UI from simpler components
- **Container/Presentational Split** - Separation of data and presentation logic

## Build System and Environment Configuration

- **Dual Build Systems**
  - Webpack and Rspack (Rust-based Webpack alternative)
  - Multiple entry points for different application contexts
  - Build modes: development (default), production, hot reload

- **Environment Detection**
  - Runtime environment detection via `env.ts` module
  - Feature flags controlled through environment variables:
    - `MB_EDITION`: Controls enterprise vs. open-source features
    - `ENABLE_CLJS_HOT_RELOAD`: Enables ClojureScript hot reloading
    - `MB_LOG_ANALYTICS`: Controls analytics logging
    - `STORYBOOK`: Detects Storybook environment

- **Conditional Code Paths**
  - Conditional imports based on environment using alias resolution
  - Environment-specific optimizations for development vs. production
  - Code splitting strategy with separate vendor bundles

## Testing Infrastructure

- **Testing Frameworks**
  - Jest for unit and integration testing
  - Cypress for end-to-end (E2E) testing
  - Testing Library for component testing
  - Loki for visual regression testing
  - Storybook for component documentation and testing

- **Testing Organization**
  - Unit tests: Co-located with source files (`.unit.spec.{js,ts,jsx,tsx}`)
  - E2E tests: In `/e2e/test/` directory (`.cy.spec.{js,ts}`)
  - Test utilities: In `frontend/test/__support__` and `frontend/test/__mocks__`

- **Testing Utilities**
  - Provider wrappers in `ui.tsx` for Redux, Router, and theme setup
  - Mock store utilities for entity state management
  - Custom matchers and testing helpers
  - Browser API mocks (ResizeObserver, etc.)

- **Visualization Testing**
  - Visual regression tests focus on visualization components
  - Mocked data patterns for consistent test results
  - Snapshot comparisons with tolerance settings for visual diffs

## Visualization System

The visualization system uses a plugin-based registry:

- Visualizations register themselves
- Transformations can be applied to data
- Settings define visualization behavior and appearance
- Implementations use various libraries (ECharts, D3, etc.)