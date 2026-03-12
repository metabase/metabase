# Testing Patterns

**Analysis Date:** 2026-03-11

## Overview

Metabase has three testing layers across two languages:

| Layer | Language | Framework | File Pattern |
|-------|----------|-----------|-------------|
| Unit (frontend) | TypeScript | Jest + React Testing Library | `*.unit.spec.{ts,tsx}` |
| Unit (backend) | Clojure | clojure.test | `*_test.clj` |
| E2E | TypeScript | Cypress | `*.cy.spec.{ts,js}` |

Preference: **Unit tests over E2E tests.** All PRs should include tests.

## Frontend Unit Tests (Jest)

### Framework

**Runner:**
- Jest 30 with jsdom environment
- Config: `jest.config.js`
- Test timeout: 30000ms (30 seconds)

**Assertion Library:**
- Jest built-in matchers + `@testing-library/jest-dom`

**Run Commands:**
```bash
bun run test-unit                          # Run all tests (builds CLJS first)
bun run test-unit-keep-cljs                # Run all tests (skip CLJS build)
bun run test-unit-keep-cljs path/to/file   # Run specific test file
bun run test-unit-keep-cljs -t "pattern"   # Run tests matching pattern
bun run test-unit-watch                    # Watch mode
```

### Test File Organization

**Location:** Co-located with source files.

**Naming:** `ComponentName.unit.spec.tsx` or `utility-name.unit.spec.ts`

**Component directory example:**
```
frontend/src/metabase/ui/components/inputs/TimeInput/
  TimeInput.tsx
  TimeInput.unit.spec.tsx   # Tests live alongside component
  TimeInput.module.css
  index.ts
```

**Jest projects (3 separate projects in `jest.config.js`):**
- `core` -- main application tests (excludes SDK and lint tests)
- `sdk` -- embedding SDK tests
- `lint-rules` -- custom ESLint rule tests (runs in node environment)

### Test Structure

**Standard pattern with setup function:**
```typescript
import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";

import { MyComponent } from "./MyComponent";

interface SetupOpts {
  defaultValue?: string;
}

function setup({ defaultValue }: SetupOpts = {}) {
  const onChange = jest.fn();

  render(<MyComponent defaultValue={defaultValue} onChange={onChange} />);

  return { onChange };
}

describe("MyComponent", () => {
  it("should render the default value", () => {
    setup({ defaultValue: "hello" });
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("should call onChange when value changes", async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByRole("textbox"), "world");
    expect(onChange).toHaveBeenCalledWith("world");
  });
});
```

**Key patterns:**
- Use a `setup()` function that renders the component and returns mocks/utilities
- Define `SetupOpts` interface for setup parameters with sensible defaults
- Use `describe` blocks for component name, nested `describe` or `it` for behavior
- Create `TestInput` wrapper components when testing controlled components

### Rendering

**Use `__support__/ui` instead of `@testing-library/react` directly:**

```typescript
import { render, screen, waitFor } from "__support__/ui";
```

The `__support__/ui` module wraps React Testing Library with:
- `ThemeProvider` (Mantine theme)
- CSS variable injection

**For tests needing Redux/Router/DND:**
```typescript
import { renderWithProviders } from "__support__/ui";

const { store, history } = renderWithProviders(<MyComponent />, {
  storeInitialState: { ... },
  withRouter: true,       // wraps with router provider
  withDND: true,          // wraps with drag-and-drop provider
  withUndos: true,        // includes undo listing
  withKBar: true,         // wraps with command palette provider
  mode: "public",         // use public reducers only
});
```

**For testing hooks:**
```typescript
import { renderHookWithProviders } from "__support__/ui";

const { result } = renderHookWithProviders(() => useMyHook(), {
  storeInitialState: { ... },
  withRouter: true,
});
```

### Mocking

**HTTP Mocking (fetch-mock):**

Globally configured in `frontend/test/jest-setup-env.js`:
- `fetchMock.mockGlobal()` called in `beforeEach`
- Unmocked routes cause automatic test failure in `afterEach`
- All fetch history cleared after each test

**Server mock helpers in `frontend/test/__support__/server-mocks/`:**
```typescript
import { setupCardEndpoints } from "__support__/server-mocks/card";
import { createMockCard } from "metabase-types/api/mocks";

const card = createMockCard({ name: "My Question" });
setupCardEndpoints(card);
```

Available server mock modules (in `frontend/test/__support__/server-mocks/`):
- `card.ts`, `dashboard.ts`, `collection.ts`, `database.ts`, `table.ts`
- `search.ts`, `permissions.ts`, `alert.ts`, `slack.ts`
- And many more -- one per API domain

**Jest mocking:**
```typescript
const onChange = jest.fn();

// Spy on DOM APIs (jsdom lacks some)
jest.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(50);
jest.spyOn(window.Element.prototype, "getBoundingClientRect").mockImplementation(...);
```

**What to mock:**
- API calls (use fetch-mock via server-mock helpers)
- DOM APIs not available in jsdom (offsetHeight, getBoundingClientRect, clipboard)
- Time-dependent code (use `@sinonjs/fake-timers` or `mockdate`)

**What NOT to mock:**
- Component internals
- Redux store (use `renderWithProviders` with `storeInitialState`)
- Router (use `renderWithProviders` with `withRouter: true`)

### Fixtures and Factories

**Mock factories in `frontend/src/metabase-types/api/mocks/`:**
```typescript
import { createMockCard } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

const card = createMockCard({
  id: 1,
  name: "My Question",
  display: "table",
});

const state = createMockState({
  currentUser: createMockUser({ is_superuser: true }),
});
```

**Pattern:** `createMock<EntityName>(opts?: Partial<Entity>): Entity`
- Returns a complete valid object with sensible defaults
- Accept partial overrides via spread

**Mock factory locations:**
- API types: `frontend/src/metabase-types/api/mocks/` (one file per entity)
- Store state: `frontend/src/metabase-types/store/mocks.ts`
- Presets (sample data): `frontend/src/metabase-types/api/mocks/presets/`

### Test Utilities

**Key utilities from `__support__/ui`:**
```typescript
import {
  render,                     // Wraps RTL render with ThemeProvider
  renderWithProviders,        // Full provider stack (Redux, Router, etc.)
  renderHookWithProviders,    // For testing hooks
  waitForLoaderToBeRemoved,   // Wait for loading-indicator to disappear
  mockOffsetHeightAndWidth,   // Mock jsdom missing APIs
  mockGetBoundingClientRect,  // Mock for virtualized components
  getIcon,                    // Find icon by name: getByLabelText(`${name} icon`)
  queryIcon,                  // Query icon by name
  getBrokenUpTextMatcher,     // Find text split across elements
} from "__support__/ui";
```

### Coverage

**Requirements:** No enforced coverage threshold.

**View Coverage:**
```bash
bun run test-unit --coverage
# Output: ./coverage/ directory with HTML and LCOV reports
```

**Coverage collection includes:**
- `frontend/src/**/*.{js,jsx,ts,tsx}`
- `enterprise/frontend/src/**/*.{js,jsx,ts,tsx}`

**Excluded from coverage:**
- `*.styled.*`, `*.story.*`, `*.info.*`, `*.unit.spec.*` files
- `node_modules/`, `target/`, `frontend/test/`

## Backend Unit Tests (Clojure)

### Framework

**Runner:**
- `clojure.test` with Hawk test runner
- Custom assert expressions via `metabase.test-runner.assert-exprs`

**Run Commands:**
```bash
./bin/mage run-tests namespace/test-name           # Run specific test
./bin/mage run-tests namespace                      # Run all tests in namespace
./bin/mage run-tests test/metabase/module            # Run all tests for module
./bin/mage run-tests ns1/test1 ns2/test2            # Run multiple tests
```

### Test File Organization

**Location:** Mirror source tree under `test/` directory.

```
src/metabase/geojson/api.clj        -> test/metabase/geojson/api_test.clj
src/metabase/stale.clj              -> test/metabase/stale_test.clj
```

**Naming:**
- Namespace: `metabase.<module>.<name>-test`
- Test functions: `deftest <descriptive-name>-test`

### Test Structure

**Standard Clojure test pattern:**
```clojure
(ns metabase.my-module.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest my-feature-test
  (testing "GET /api/my-endpoint"
    (testing "returns expected data"
      (is (= expected-value
             (mt/user-http-request :crowberto :get 200 "my-endpoint"))))
    (testing "requires admin permissions"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "my-endpoint"))))))
```

**Key patterns:**
- Always `(set! *warn-on-reflection* true)` at top of test files
- Use nested `testing` blocks for organized test structure
- Separate `deftest` forms for logically separate test cases
- Test names MUST end in `-test` or `-test-<number>`
- Mark pure function tests with `^:parallel` metadata

### Test Helpers (metabase.test)

**Import the unified test namespace:**
```clojure
(:require [metabase.test :as mt])
```

The `metabase.test` namespace (`test/metabase/test.clj`) re-exports helpers from many sub-namespaces. Key utilities:

**HTTP testing:**
```clojure
(mt/user-http-request :crowberto :get 200 "endpoint" :param value)
(mt/user-http-request :rasta :put 400 "setting/my-setting" {:value data})
```

**Test users:** `:crowberto` (admin), `:rasta` (normal user), and others.

**Temporary state:**
```clojure
(mt/with-temporary-setting-values [my-setting nil]
  ;; setting is restored after block
  ...)

(mt/with-temp-env-var-value! [mb-my-var false]
  ;; env var is restored after block
  ...)

(mt/with-temp [Card card {:name "Test Card"}]
  ;; temporary database record, cleaned up after block
  ...)
```

**Test data:**
- Example/test data should be bird-themed when possible

### Mocking (Clojure)

**HTTP mocking with clj-http.fake:**
```clojure
(require '[clj-http.fake :as fake])

(fake/with-fake-routes
  {"https://example.com/api" (constantly {:status 200
                                          :headers {:content-type "application/json"}
                                          :body    "{\"key\": \"value\"}"})}
  ;; test code here
  )
```

**Redef for function mocking:**
```clojure
(with-redefs [my-ns/connection-timeout-ms 200]
  ;; test with overridden value
  )
```

## E2E Tests (Cypress)

### Framework

**Runner:**
- Cypress 15
- Config: Cypress configuration in `e2e/` directory

**Run Commands:**
```bash
bun run test-cypress    # Run Cypress tests locally
```

### Test File Organization

**Location:** `e2e/test/scenarios/` organized by feature area.

```
e2e/test/scenarios/
  actions/
  admin/
  collections/
  dashboard/
  dashboard-cards/
  dashboard-filters/
  data-model/
  embedding/
  filters/
  organization/
  ...
```

**Naming:** `feature-name.cy.spec.{ts,js}`

### Test Structure

**Cypress test pattern:**
```typescript
const { H } = cy;

describe("scenarios > feature > sub-feature", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should do something", () => {
    H.visitQuestion(QUESTION_ID);
    // assertions
  });
});
```

**Key patterns:**
- Access helpers via `const { H } = cy;` -- the `H` object contains all Metabase-specific Cypress helpers
- Use `H.restore()` to reset database state before each test
- Use `H.visitQuestion()`, `H.openNavigationSidebar()`, etc. for Metabase-specific actions
- Use Snowplow tracking assertions: `H.resetSnowplow()`, `H.expectNoBadSnowplowEvents()`
- Double quotes enforced for E2E test strings (ESLint rule)

### E2E Custom Rules (ESLint)

- `metabase/no-unscoped-text-selectors: "error"` -- avoid broad text selectors
- `metabase/no-direct-helper-import: "error"` -- use `H` object
- `metabase/no-unsafe-element-filtering: "warn"` -- avoid fragile DOM traversal
- `metabase/no-unordered-test-helpers: "error"` -- maintain test helper ordering

### Test Data

- E2E uses `e2e/support/cypress_sample_instance_data.js` for test IDs
- Do NOT import from `metabase-types/api/mocks/presets` in E2E (use Cypress sample data instead)

## ClojureScript Tests

```bash
bun run test-cljs    # Compile and run ClojureScript tests
```

Compiles via shadow-cljs and runs with Node.js.

## Visual Regression Tests

```bash
bun run test-visual:loki              # Run Loki visual tests
bun run test-visual:loki:ci           # CI version (builds storybook first)
bun run test-visual:loki-report       # Generate visual diff report
bun run test-visual:loki-approve-diff # Approve visual changes
```

Uses Loki with Storybook for component screenshot comparison.

## Timezone Tests

```bash
bun run test-timezones       # Run timezone-specific tests
bun run test-timezones-unit  # Run timezone unit tests
```

Separate test config: `jest.tz.unit.conf.js` for timezone-sensitive tests.
File pattern: `*.tz.unit.spec.{js,jsx,ts,tsx}`

## Test Setup Files

**Global setup (runs before all tests):**
- `frontend/test/jest-setup.js` -- polyfills (TextEncoder, crypto, ReadableStream, etc.)
- `frontend/test/metabase-bootstrap.js` -- Metabase-specific bootstrap
- `frontend/test/register-visualizations.js` -- visualization registration

**Per-test setup (runs before each test file):**
- `frontend/test/jest-setup-env.js` -- fetch-mock setup, cleanup, unmocked route detection

**SDK-specific setup:**
- `frontend/src/embedding-sdk-shared/jest/setup-env.js`
- `frontend/src/embedding-sdk-shared/jest/setup-after-env.js`
- `frontend/src/embedding-sdk-shared/jest/console-restrictions.js`

## Common Patterns

**Async Testing (TypeScript):**
```typescript
it("should handle async action", async () => {
  const { onChange } = setup();
  await userEvent.type(screen.getByRole("textbox"), "value");
  await userEvent.tab();
  expect(onChange).toHaveBeenCalledWith(expectedValue);
});
```

**Waiting for loading states:**
```typescript
import { waitForLoaderToBeRemoved } from "__support__/ui";

it("should load data", async () => {
  setup();
  await waitForLoaderToBeRemoved();
  expect(screen.getByText("Data")).toBeInTheDocument();
});
```

**Error Testing (Clojure):**
```clojure
(deftest error-handling-test
  (testing "returns error for invalid input"
    (is (= "Expected error message"
           (mt/user-http-request :crowberto :get 400 "endpoint" :param "invalid")))))
```

**Parallel tests (Clojure):**
```clojure
(deftest ^:parallel my-pure-function-test
  (testing "pure computation"
    (is (= expected (my-pure-fn input)))))
```

---

*Testing analysis: 2026-03-11*
