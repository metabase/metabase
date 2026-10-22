# Component example

## Convert: the filter value list shows a loader while values load

### Before: Cypress

`e2e/test/scenarios/dashboard-filters/dashboard-filters-reproductions-1.cy.spec.js`, `describe("issue 25322")` (on master at line 1111 before this conversion; see `git log -S "issue 25322" -- e2e/test/scenarios/dashboard-filters/` after it merges). It creates a question and a dashboard with a "Location" filter, delays `GET /api/dashboard/:id/params/f8ec7c71/values` by 100 ms, clicks the filter, and checks that the popover shows `loading-indicator`.

### Why it can move

- The helpers create data through the API and delay one response. They contain no hover, layout, or navigation. The claim is that the widget shows a loader while its values request is pending. The click on the filter and the popover only open the widget. They are setup.
- The backend only supplies a slow response. It does not decide anything that the test checks.
- Behavior owner: `FieldValuesWidget` (`frontend/src/metabase/parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/FieldValuesWidget.tsx`). `fetchValues` sets `loadingState` to `"LOADING"`, and list mode shows the loader while `isLoading` is true.
- Seam: `FieldValuesWidget.unit.spec.tsx` has a `setup()` that renders the widget with providers.

### After: Jest

```ts
describe("loading state", () => {
  it("should show a loader while dashboard parameter values are loading (metabase#25322)", async () => {
    const field = createMockField({ id: 30, has_field_values: "list" });
    const parameter: FieldFilterUiParameter = {
      ...createMockParameter({ id: "f8ec7c71", type: "string/=" }),
      fields: [field],
    };
    const valuesUrl = "path:/api/dashboard/10/params/f8ec7c71/values";
    const valuesRequest = defer();
    setupDashboardParameterValuesEndpoint(10, "f8ec7c71", () =>
      valuesRequest.promise.then(() =>
        createMockParameterValues({ values: [["CA"], ["NY"]] }),
      ),
    );
    setup({
      parameter,
      parameters: [parameter],
      fields: [field],
      dashboardId: 10,
      multi: true,
    });

    await waitFor(() =>
      expect(fetchMock.callHistory.called(valuesUrl)).toBe(true),
    );
    const loader = screen.queryByTestId("loading-indicator");
    // Resolve before asserting, so a failed assertion leaves no pending request.
    valuesRequest.resolve();
    expect(loader).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("CA")).toBeInTheDocument();
  });
});
```

- No server-mock helper existed for `GET /api/dashboard/:id/params/:id/values`. The conversion added `setupDashboardParameterValuesEndpoint(dashboardId, parameterId, response)` to `frontend/test/__support__/server-mocks/dashboard.ts`. It accepts a value or a function that returns a promise, as `setupTimelinesEndpoints` does. The function form can hold the response back:

  ```ts
  export function setupDashboardParameterValuesEndpoint(
    dashboardId: DashboardId,
    parameterId: ParameterId,
    response: ParameterValues | (() => Promise<ParameterValues>),
  ) {
    fetchMock.get(
      `path:/api/dashboard/${dashboardId}/params/${parameterId}/values`,
      response,
    );
  }
  ```

- Evidence for the order rule in SKILL.md: when the assertion came before the resolve and failed, the pending request hung `afterEach` for 30 s (`frontend/test/jest-setup-env.js` flushes `fetchMock` call history there).
- The props are the ones that `ParameterFieldWidget` passes and that the claim depends on. Props for display only (`formatOptions`, `minWidth`, `placeholder`) are left out.
- The last two lines prove that the loader goes away and the values show.
- The loader has no accessible role or label, so the test finds it with `queryByTestId`.
- Use `toBeInTheDocument()`, not `not.toBeNull()`. Lint rule `jest-dom(prefer-in-document)` rejects the second form.

### Proof

All mutants are in `FieldValuesWidget.tsx`. Each one fails in about 1.5 s, on an assertion:

| Mutant | Result |
|---|---|
| `isLoading = loadingState === "LOADED"` (wrong value) | fails: no loader |
| `setLoadingState("LOADING")` removed from `fetchValues` | fails: no loader |

The whole `describe("issue 25322")` block in the Cypress spec is deleted, with its local helpers. `PEOPLE` and `PEOPLE_ID` stay, because other tests in the file use them.

### Confidence lost

- The test builds the UI parameter by hand. It does not prove that dashboard hydration (`getSavedDashboardUiParameters` and `getUnsavedDashboardUiParameters` in `metabase/parameters/utils/dashboards.ts`) gives the parameter `fields` with `has_field_values: "list"`.
- Setup coverage lost: it does not prove that a click on the filter opens this widget in a popover.
- `dashboard-filters-text-category.cy.spec.js` still covers the value list in a real dashboard. No E2E test checks the loader now.
