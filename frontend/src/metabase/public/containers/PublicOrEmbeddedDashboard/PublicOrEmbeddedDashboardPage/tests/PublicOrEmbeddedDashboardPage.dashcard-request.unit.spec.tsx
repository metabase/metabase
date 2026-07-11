import type { Reducer } from "@reduxjs/toolkit";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { FETCH_DASHBOARD_CARD_DATA } from "metabase/dashboard/actions";
import { createMockParameter } from "metabase-types/api/mocks";

import { setup } from "./setup";

// Records how many times the dashboard triggers a card-data fetch. We count the
// dispatched thunk rather than surviving HTTP requests because each card's fetch
// dedupes identical in-flight requests, which would otherwise mask a redundant
// second fetch fired within the same render.
const fetchCardDataCount: Reducer<number> = (state = 0, action) =>
  action.type === FETCH_DASHBOARD_CARD_DATA ? state + 1 : state;

describe("PublicOrEmbeddedDashboardPage > dashcard requests", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should not fetch card data twice when opening a dashboard with parameters (metabase#17061)", async () => {
    // Loading the dashboard also initializes `parameterValues`. That parameter
    // change must not trigger a second card-data fetch on top of the initial
    // load fetch.
    const { store } = await setup({
      dashboardTitle: "Orders in a dashboard",
      parameters: [
        createMockParameter({
          id: "5aefc725",
          name: "State",
          slug: "state",
          type: "string/=",
          sectionId: "location",
        }),
      ],
      customReducers: { fetchCardDataCount },
    });

    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

    expect(
      (store.getState() as unknown as { fetchCardDataCount: number })
        .fetchCardDataCount,
    ).toBe(1);
  });
});
