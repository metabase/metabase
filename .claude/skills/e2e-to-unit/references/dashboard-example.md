# Dashboard example

## Convert: same `dashboard_load_id` for every card query

### Before: Cypress

`e2e/test/scenarios/dashboard/dashcard-fetching.cy.spec.js` was the whole spec. This conversion deleted it (see `git log --diff-filter=D -- e2e/test/scenarios/dashboard/dashcard-fetching.cy.spec.js` after it merges). It created a dashboard with two cards, visited it, and read the two query request bodies.

```js
it("should pass same dashboard_load_id to every query to enable metadata cache sharing", () => {
  createDashboardWithCards({ cards }).then(H.visitDashboard);

  cy.wait(["@dashcardQuery", "@dashcardQuery"]).then((interceptions) => {
    const query1 = interceptions[0].request.body;
    const query2 = interceptions[1].request.body;

    expect(query1.dashboard_load_id).to.have.length(36);
    expect(query2.dashboard_load_id).to.have.length(36);
    expect(query1.dashboard_load_id).to.equal(query2.dashboard_load_id);
  });
});
```

### Why it can move

- No hard gate applies. The assertion reads a request body. It does not read a rendered pixel or a server result.
- Behavior owner: `fetchDashboardCardData` in `frontend/src/metabase/dashboard/actions/data-fetching.ts`. It calls `uuid()` once and passes `dashboardLoadId` through `fetchCardData` to `fetchCardDataAction` for each card. That thunk puts it in the RTK Query request body.
- Seam: `frontend/src/metabase/dashboard/actions/data-fetching.unit.spec.ts` already has `setup()`. It builds a real store with the dashboard reducers and RTK Query middleware, so the real thunk runs and sends real request bodies to `fetchMock`.

### After: Jest

Add a helper at module level, and this test in the `describe("fetchDashboardCardData")` block. If your checkout already has this test, the conversion has merged. Read it there. It uses the file's `setup()`, which builds a real store with the dashboard reducers and RTK Query middleware.

```ts
function getDashboardLoadId(body: unknown) {
  return typeof body === "object" &&
    body !== null &&
    "dashboard_load_id" in body
    ? body.dashboard_load_id
    : undefined;
}

it("sends the same dashboard_load_id with every card query", async () => {
  const dashcards = [
    { id: 10, cardId: 11 },
    { id: 20, cardId: 21 },
  ].map(({ id, cardId }) =>
    createMockDashboardCard({
      id,
      card_id: cardId,
      dashboard_id: 1,
      card: createMockCard({ id: cardId }),
    }),
  );
  const dashboard = createMockDashboard({ id: 1, dashcards });
  const store = setup({
    dashboard: createMockDashboardState({
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: createMockStoreDashboard({
          ...dashboard,
          dashcards: dashcards.map((dashcard) => dashcard.id),
        }),
      },
      dashcards: Object.fromEntries(
        dashcards.map((dashcard) => [dashcard.id, dashcard]),
      ),
    }),
  });
  dashcards.forEach((dashcard) => {
    setupDashcardQueryEndpoints(1, dashcard, createMockDataset());
  });

  await store.dispatch(fetchDashboardCardData());

  const loadIds = fetchMock.callHistory
    .calls("matched", { method: "POST" })
    .map((call) => getDashboardLoadId(JSON.parse(String(call.options.body))));
  expect(loadIds).toHaveLength(2);
  expect(loadIds[0]).toHaveLength(36);
  expect(loadIds[1]).toBe(loadIds[0]);
});
```

- Do not mock `uuid`, `fetchCardDataAction`, or the RTK Query endpoint. They are the subject.
- `setupDashcardQueryEndpoints` comes from `__support__/server-mocks/dashcard`. The barrel `__support__/server-mocks` does not export it. Add `createMockDataset` to the `metabase-types/api/mocks` import.
- Do not use `setupConcurrencyTest` from the same file. Its fake `dispatch` needs `as never` casts.
- `calls("path:/api/dashboard/1/dashcard/*/card/*/query")` returns nothing, because the `path:` matcher has no wildcards. `calls({ method: "POST" })` runs, but it is a type error. Use `calls("matched", { method: "POST" })`.
- The `toHaveLength(2)` check stops the test from passing with zero calls.

### Proof

```bash
bun run test-unit-keep-cljs --runInBand --runTestsByPath frontend/src/metabase/dashboard/actions/data-fetching.unit.spec.ts -t "dashboard_load_id"
```

It passes, and `bun run type-check-pure` reports no error in it. Each mutant below, on the `dashboard_load_id` line in `fetchCardDataAction`, makes it fail:

| Mutant | Result |
|---|---|
| `dashboard_load_id: uuid(),` (a new ID per card) | fails: the two IDs differ |
| `dashboard_load_id: undefined,` (ID removed) | fails: no ID in the body |

Then delete `dashcard-fetching.cy.spec.js`. Its only test moved, and `createDashboardWithCards` is local to it.

### Confidence lost

The Jest test does not prove that opening a dashboard URL starts the card queries. Every dashboard E2E test that shows card data covers that. Say this in the report. Do not call the conversion lossless.

## Keep in Cypress

- `dashcard-visualization-options.cy.spec.js`: even the short empty-title case uses an ECharts container, real hover, and the rendered actions menu. Those are hard browser gates.
- `dashcard-undo.cy.spec.js`: its claim includes `getBoundingClientRect`, card order, tab movement, hover actions, and restored grid positions.
- `dashboard-reproductions.cy.spec.js`, the long dashboard-name reproduction (metabase#53370): its assertion compares the rendered width with `win.innerWidth`.

## Historical pattern

Good conversions reduce an indirect browser story to its actual behavior owner. Dashboard issue `#56716` became an action test for structural equality (commit `5a29fa68799`). The unit test ran the production decision directly. It did not recreate the UI journey. Before you call a test "already covered" because of an earlier conversion, find the commit and the unit test it added.
