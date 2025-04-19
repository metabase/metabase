# Visualization Testing Patterns

This document analyzes the approaches used for testing visualizations in the Metabase codebase, focusing on unit tests, integration tests, and visual regression testing techniques.

## Testing Architecture Overview

Metabase employs a multi-layered testing approach for visualizations:

1. **Unit Tests**: Test visualization components and utilities in isolation
2. **Integration Tests**: Test end-to-end visualization functionality in Cypress
3. **Visual Regression Tests**: Test visual appearance using Loki with Storybook

This layered approach ensures both functional correctness and visual consistency across the visualization system.

## 1. Unit Tests

Unit tests focus on testing visualization components and utilities in isolation. They primarily use Jest as the test runner.

### Test Setup Patterns

Metabase uses several key patterns for setting up visualization unit tests:

#### 1. Mocking Dependencies

Before testing visualizations, essential dependencies are mocked:

```javascript
// We need to mock this *before* registering the visualizations.
jest.mock("metabase/components/ExplicitSize");

// Also mock NativeQueryEditor
jest.mock("metabase/query_builder/components/NativeQueryEditor");
```

#### 2. Registration Before Testing

Visualizations must be registered before tests are run:

```javascript
import registerVisualizations from "metabase/visualizations/register";
registerVisualizations();
```

#### 3. Creating Test Data

Test data is often created using mock factories:

```javascript
const series = [
  {
    card: createMockCard({ name: "Card", display: "bar" }),
    data: {
      cols: [StringColumn({ name: "Foo" }), NumberColumn({ name: "Bar" })],
      rows: [["Baz", 1]],
    },
  },
] as Series;
```

#### 4. Provider Wrapping

Components are rendered within providers to ensure proper context:

```javascript
renderWithProviders(<Visualization rawSeries={series} />, {
  theme: { colors: { "text-dark": getColorShades(TEST_COLOR) } },
});
```

### Types of Unit Tests

#### 1. Component Rendering Tests

Test that visualization components render correctly:

```typescript
it("should not error when rendering for a question without breakouts", () => {
  // Setup test with specific data
  setup({ question, series });

  // Check that UI elements are present
  expect(screen.getByText("X-axis")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("No valid fields")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Count")).toBeInTheDocument();
});
```

#### 2. Theme Integration Tests

Test that components correctly apply theming:

```typescript
it("inherits the chart label color from the theme", async () => {
  const TEST_COLOR = "rgb(44, 55, 66)";
  
  renderWithProviders(<Visualization rawSeries={series} />, {
    theme: { colors: { "text-dark": getColorShades(TEST_COLOR) } },
  });

  await delay(0);
  expect(screen.getByText("Foo")).toHaveAttribute("fill", TEST_COLOR);
  expect(screen.getByText("Baz")).toHaveAttribute("fill", TEST_COLOR);
});
```

#### 3. Utility Function Tests

Test visualization utility functions:

```typescript
// Example from scalar_utils.unit.spec.ts
describe("getScalarValue", () => {
  it("should return the first value of the first row", () => {
    expect(getScalarValue({ rows: [[1]] })).toBe(1);
  });
});
```

#### 4. Visualization Settings Tests

Test that visualization settings are applied correctly:

```typescript
it("should respect column formatting settings", () => {
  setup({
    series,
    settings: {
      column_settings: {
        '["name","count"]': { number_style: "percent" },
      },
    },
  });
  
  expect(screen.getByText("42%")).toBeInTheDocument();
});
```

### Key Unit Test Files

The unit tests are organized around the main visualization components, utilities, and settings:

1. **Component Tests**:
   - `Visualization-themed.unit.spec.tsx` - Tests for the core Visualization component
   - `BarChart.unit.spec.tsx` - Tests for specific chart types
   - `SmartScalar.unit.spec.js` - Tests for scalar visualizations
   - `PivotTable.unit.spec.js` - Tests for pivot tables

2. **Utility Tests**:
   - `dataset.unit.spec.ts` - Tests for dataset handling utilities
   - `scalar_utils.unit.spec.ts` - Tests for scalar-specific utilities
   - `utils.unit.spec.ts` - Tests for general utility functions

3. **Settings Tests**:
   - `settings.unit.spec.js` - Tests for general settings functionality
   - `column.unit.spec.js` - Tests for column settings
   - `nested.unit.spec.js` - Tests for nested settings

## 2. Integration Tests with Cypress

Cypress tests provide end-to-end testing of visualizations, ensuring they render correctly and behave as expected within the application.

### Test Structure

Cypress tests follow a consistent pattern:

1. **Setup**: Restore the database, sign in, and set up API intercepts
2. **Create test data**: Either use existing sample data or create custom data
3. **Interact with visualizations**: Click, hover, and perform actions
4. **Assertions**: Verify the visualization displays correctly and responds to interactions

### Common Test Patterns

#### 1. Query-based Visualization Tests

Tests create a question with a specific query and verify the visualization:

```javascript
it("should not show a bar for null values", () => {
  H.visitQuestionAdhoc(
    getQuestion({
      "graph.dimensions": ["a"],
      "graph.metrics": ["b"],
    }),
  );

  cy.findByText("(empty)").should("not.exist");
});
```

#### 2. Interactive Testing

Tests interact with visualizations and verify the results:

```javascript
it("should allow you to show/hide and reorder columns", () => {
  H.moveDnDKitElement(H.getDraggableElements().eq(0), { vertical: 100 });

  cy.findAllByTestId("legend-item").eq(0).should("contain.text", "Gadget");
  
  // Hide a series
  H.getDraggableElements().eq(1).icon("close").click({ force: true });
  
  // Verify series is hidden
  cy.findByTestId("query-visualization-root")
    .findByText("Gizmo")
    .should("not.exist");
});
```

#### 3. Tooltip Testing

Tests hover over chart elements and verify tooltips:

```javascript
H.chartPathWithFillColor("#88BF4D").first().realHover();
H.assertEChartsTooltip({
  header: "2022",
  rows: [
    {
      color: "#88BF4D",
      name: "Sum of Total",
      value: "21,078.43",
      index: 0,
    },
    {
      color: "#98D9D9",
      name: "Sum of Total",
      value: "42,156.87",
      index: 1,
    },
  ],
});
```

### Test Helper Functions

The Cypress tests use a comprehensive set of helper functions (`H`) to simplify testing:

- `H.visitQuestionAdhoc()` - Visit a question with specific settings
- `H.chartPathWithFillColor()` - Select chart elements by color
- `H.echartsContainer()` - Access the ECharts container
- `H.assertEChartsTooltip()` - Verify tooltip content
- `H.moveDnDKitElement()` - Drag and drop elements

These helpers provide abstraction for common visualization interaction patterns, making tests more readable and maintainable.

### Key Cypress Test Files

The integration tests are organized by visualization type:

1. **Chart Tests**:
   - `bar_chart.cy.spec.js` - Tests for bar charts
   - `line_chart.cy.spec.js` - Tests for line charts
   - `pie_chart.cy.spec.js` - Tests for pie charts
   - `maps.cy.spec.js` - Tests for map visualizations

2. **Tabular Data Tests**:
   - `table.cy.spec.js` - Tests for table visualizations
   - `pivot_tables.cy.spec.js` - Tests for pivot tables
   - `scalar.cy.spec.js` - Tests for scalar visualizations

3. **Interactive Feature Tests**:
   - `dash_drill.cy.spec.js` - Tests for drill-through in dashboards
   - `chart_drill.cy.spec.js` - Tests for drill-through in charts
   - `table_drills.cy.spec.js` - Tests for drill-through in tables

## 3. Visual Regression Testing

Metabase uses [Loki](https://loki.js.org/) with Storybook for visual regression testing, which captures snapshots of visualization components and compares them with references.

### Configuration

The visual regression testing setup is defined in `loki.config.js`:

```javascript
module.exports = {
  diffingEngine: "looks-same",
  storiesFilter: [
    "DataGrid",
    "static-viz",
    "viz",
    "^visualizations/shared",
    "^app/embed",
    // Other filters...
  ].join("|"),
  configurations: {
    "chrome.laptop": {
      target: "chrome.docker",
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    },
  },
  "looks-same": {
    strict: false,
    antialiasingTolerance: 9,
    tolerance: 9,
  },
};
```

This configuration:
1. Uses the "looks-same" diffing engine
2. Filters which stories to include in visual testing
3. Configures the browser target and viewport
4. Sets tolerance levels for image comparison

### Storybook Stories

Visualization components have corresponding Storybook stories:

```typescript
// PieChart.stories.tsx
export default {
  title: "viz/PieChart",
  component: PieChart,
};

registerVisualization(PieChart);

export const EmbeddedQuestion = {
  render: Template,
  args: {
    isDashboard: false,
    backgroundColor: "#ebe6e2",
  },
  parameters: {
    loki: { skip: true },  // Can skip tests temporarily
  },
};
```

These stories provide:
1. Different variations of the component
2. Various prop combinations for testing
3. Theming variations

### Running Visual Tests

According to the documentation, visual tests can be run with:

```
yarn test-visual:loki          # Run tests
yarn test-visual:loki-approve-diff  # Update references
yarn test-visual:loki-report   # Generate report
```

### Visual Test Workflow

The workflow for visual testing is:

1. Create/update Storybook stories
2. Run visual tests to capture current appearance
3. Compare with reference images
4. Review and approve changes as needed
5. Update reference images when intentional changes are made

In CI, visual tests are automated, and changes can be approved by adding the `loki-update` label to pull requests.

## Testing Best Practices

Based on the analyzed code, Metabase follows several key testing best practices:

### 1. Multi-layered Testing Approach

- Unit tests for components and utilities
- Integration tests for full functionality
- Visual regression tests for appearance

### 2. Comprehensive Test Coverage

- Tests for normal usage scenarios
- Tests for edge cases and error conditions
- Tests for interactions and responsiveness

### 3. Realistic Test Data

- Mix of sample data and custom test data
- Testing with various data shapes and sizes
- Testing with null, negative, and extreme values

### 4. Abstraction and Reuse

- Reusable test utilities and helpers
- Common patterns for setup and assertion
- Consistent approach across different visualization types

### 5. Isolation and Integration

- Testing components in isolation
- Testing components within application context
- Testing interactions between components

## Conclusion

Metabase employs a comprehensive testing strategy for visualizations that combines:

1. **Unit Tests** for component and utility verification
2. **Integration Tests** for end-to-end functionality
3. **Visual Regression Tests** for appearance consistency

This multi-layered approach ensures that visualizations render correctly, respond to interactions appropriately, and maintain visual consistency across releases.

The testing patterns emphasize real-world usage, edge cases, and visual design, creating a robust testing framework that supports the complex visualization system in Metabase.