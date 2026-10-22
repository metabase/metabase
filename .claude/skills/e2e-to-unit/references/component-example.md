# Component example: a loader while values load (metabase#25322)

Cypress delayed `GET /api/dashboard/:id/params/f8ec7c71/values`, clicked the filter, and checked `loading-indicator`. The click only opens the widget, so it is setup. The owner is `FieldValuesWidget`.

```ts
it("should show a loader while dashboard parameter values are loading (metabase#25322)", async () => {
  const field = createMockField({ id: 30, has_field_values: "list" });
  const parameter: FieldFilterUiParameter = {
    ...createMockParameter({ id: "f8ec7c71", type: "string/=" }),
    fields: [field],
  };
  const valuesRequest = defer();
  setupDashboardParameterValuesEndpoint(10, "f8ec7c71", () =>
    valuesRequest.promise.then(() =>
      createMockParameterValues({ values: [["CA"], ["NY"]] }),
    ),
  );
  setup({ parameter, parameters: [parameter], fields: [field], dashboardId: 10, multi: true });

  await waitFor(() =>
    expect(fetchMock.callHistory.called("path:/api/dashboard/10/params/f8ec7c71/values")).toBe(true),
  );
  const loader = screen.queryByTestId("loading-indicator");
  valuesRequest.resolve();
  expect(loader).toBeInTheDocument();
  await waitForLoaderToBeRemoved();
  expect(screen.getByText("CA")).toBeInTheDocument();
});
```

The request is resolved before the assertion. If the assertion fails first, the pending request hangs `afterEach`.

| Mutant in `FieldValuesWidget.tsx` | Result |
|---|---|
| `isLoading = loadingState === "LOADED"` | fails: no loader |
| `setLoadingState("LOADING")` removed | fails: no loader |

Confidence lost: the parameter is built by hand, so dashboard hydration of `fields` is not tested.
