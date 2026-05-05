## Test Type Selection

| Bug Type | Test Type | Location |
|----------|-----------|----------|
| Backend logic, query processor, API | **Clojure unit test** | `test/metabase/...` |
| Frontend UI behavior, rendering | **Jest unit/component test** | Co-located `*.unit.spec.tsx` or `frontend/test/...` |
| End-to-end user workflow, UI interaction | **Cypress acceptance test** | `e2e/test/scenarios/...` |
| Mixed (backend + frontend) | **Both** — Clojure test for data + frontend/e2e test for UI |

### Find the right test file

- **Backend**: `src/metabase/foo/bar.clj` → `test/metabase/foo/bar_test.clj`
- **Frontend**: `frontend/src/metabase/foo/Bar.tsx` → `frontend/src/metabase/foo/Bar.unit.spec.tsx`
- **E2E**: UI workflow → `e2e/test/scenarios/<category>/foo.cy.spec.ts`

Search for existing tests of the buggy function/component first — add to the existing file when possible.

### Backend test approach

| Root Cause Type | Test Approach |
|----------------|--------------|
| Query processor bug | `mt/process-query` or `qp/process-query` |
| API endpoint bug | `mt/user-http-request` |
| Model / data bug | `mt/with-temp` + `t2/select` |
| Pure logic / edge case | Direct function call with specific inputs |

### Frontend test approach

| Root Cause Type | Test Approach |
|----------------|--------------|
| Component rendering | Jest + React Testing Library — render, assert DOM |
| User interaction | Cypress — visit page, interact, assert visible result |
| Data display / formatting | Jest unit test on the formatting/transform function |
| State management | Jest — test reducer/action/selector with specific inputs |

### Naming conventions

- **Clojure**: `(deftest issue-12345-test ...)` — reference the issue ID
- **Jest**: `it("should handle X (issue #12345)")` or `it("should not show X when Y (metabase#12345)")`
- **Cypress**: Descriptive scenario name with issue reference in comment

### Running tests

- **Backend**: `./bin/test-agent :only '[metabase.foo-test/issue-12345-test]'`
- **Frontend unit**: `bun run test-unit-keep-cljs path/to/file.unit.spec.ts`
- **Cypress**: `npx cypress run --spec e2e/test/scenarios/category/file.cy.spec.ts`
