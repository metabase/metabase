# Metabase Development Guide

## Autonomous Development Workflow

- Do not attempt to read or edit files outside the project folder
- Add failing tests first, then fix them
- Work autonomously in small, testable increments
- Run targeted tests, and lint continuously during development
- Prioritize understanding existing patterns before implementing
- Don't commit changes, leave it for the user to review and make commits

## Quick Commands

### JavaScript/TypeScript

- **Lint:** `yarn lint-eslint`
- **Test:** `yarn test-unit path/to/file.unit.spec.js` or `yarn test-unit -t "pattern"`
- **Watch:** `yarn test-unit-watch path/to/file.unit.spec.js`
- **Format:** `yarn prettier`
- **Type Check:** `yarn type-check`

### Clojure

- **Lint:** `./bin/mage kondo [path]`
- **Format:** `./bin/mage cljfmt-files [path]`
- **Test file:** `clojure -X:dev:test :only namespace/test-name`

### ClojureScript

- **Test:** `yarn test-cljs`

## Codebase

### Frontend Technologies

- **React** - Main frontend library
- **Redux Toolkit** - State management library
- **Mantine UI** - Customized UI component library, components are reexported from `metabase/ui`
- **Styling** - Prefer Mantine style props; only when necessary, use CSS modules
- **ECharts** - Visualization library for charts

## Testing Conventions

- Use isolated unit tests when the change is reasonable to test without complex dependencies
- Tests must not mock internal details of components/functions being tested
- Use helper factories like `createMockCard()` to create test objects
- For more complex cases, write e2e Cypress tests in `e2e/test/scenarios/`

### Mock Object Factories

- Use mock factories to create test objects
- Example: `createMockCard()` for Card objects
- Located in `frontend/src/metabase-types/api/mocks/`

```javascript
import { createMockCard } from "metabase-types/api/mocks";

const card = createMockCard({
  id: 1,
  name: "Test Card",
  // Override other properties as needed
});
```

### Clojure Testing

- Tests are in `test/metabase/` matching the namespace structure of `src/`
- Use `deftest` for test definitions
- Use `testing` for organizing test groups
- Use `is` for assertions

```clojure
(deftest my-function-test
  (testing "should handle normal case"
    (is (= expected (my-function input)))))
```

## Code Style Conventions

### JavaScript/TypeScript

- Using TypeScript for new code is preferred
- Components should be in their own directories with related files
- React functional components with hooks are preferred over class components
- Use `.tsx` extension for React components with TypeScript
- Use `.unit.spec.tsx` for component tests

### Clojure/ClojureScript

- Functions should have docstrings
- Use `cljfmt` for consistent formatting
- Use ClojureScript for frontend-facing code that needs to interoperate with the Clojure backend

## Development Workflow Tips

- Every bug fix or feature should include automated tests
- The codebase uses a combination of Clojure (backend) and JavaScript/TypeScript (frontend)
- Tests should be comprehensive and match the existing patterns
- Use the provided factories for creating test objects
- Follow existing patterns when adding new features

## Application Entities

- **Card/Question** - Saved questions/visualizations that can be displayed in dashboards
- **Dashboard** - Collections of cards/visualizations
- **Collection** - Organizational units for Cards, Dashboards, etc.
- **Database** - Connected data sources
- **Field** - Column in a database table
- **Table** - Database table
- **Segment** - Saved filters that can be applied to queries
- **Metric** - Saved aggregations that can be used in queries
