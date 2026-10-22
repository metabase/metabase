# Dashboard example: one `dashboard_load_id` for every card query

Cypress read two query request bodies:

```js
cy.wait(["@dashcardQuery", "@dashcardQuery"]).then((interceptions) => {
  const [query1, query2] = interceptions.map((i) => i.request.body);
  expect(query1.dashboard_load_id).to.have.length(36);
  expect(query1.dashboard_load_id).to.equal(query2.dashboard_load_id);
});
```

The owner is the `fetchDashboardCardData` thunk. `data-fetching.unit.spec.ts` has a `setup()` with a real store and RTK Query middleware, so the real thunk sends real request bodies to `fetchMock`.

```ts
it("should pass same dashboard_load_id to every query to enable metadata cache sharing", async () => {
  // two dashcards with distinct ids (10, 20) and card ids (11, 21)
  const store = setup({ dashboard: dashboardState });
  dashcards.forEach((dashcard) => setupDashcardQueryEndpoints(1, dashcard, createMockDataset()));

  await store.dispatch(fetchDashboardCardData());

  const loadIds = fetchMock.callHistory
    .calls("matched", { method: "POST" })
    .map((call) => getDashboardLoadId(JSON.parse(String(call.options.body))));
  expect(loadIds).toHaveLength(2);
  expect(loadIds[0]).toHaveLength(36);
  expect(loadIds[1]).toBe(loadIds[0]);
});
```

Do not mock `uuid` or the thunk. They are the subject. `toHaveLength(2)` stops a pass with zero calls.

| Mutant in `fetchCardDataAction` | Result |
|---|---|
| `dashboard_load_id: uuid(),` | fails: the IDs differ |
| `dashboard_load_id: undefined,` | fails: no ID |

Confidence lost: opening a dashboard URL is not tested. Every dashboard E2E test covers it.

Stay in Cypress: `dashcard-visualization-options` (ECharts, real hover), `dashcard-undo` (`getBoundingClientRect`, grid positions), metabase#53370 (width against `win.innerWidth`).
