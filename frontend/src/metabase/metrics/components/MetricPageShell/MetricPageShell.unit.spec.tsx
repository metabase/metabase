import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupCollectionsEndpoints } from "__support__/server-mocks/collection";
import { setupMetricEndpoint } from "__support__/server-mocks/metric";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { Card } from "metabase-types/api";
import { createMockCard, createMockCollection } from "metabase-types/api/mocks";
import { createMockMetric } from "metabase-types/api/mocks/metric";

import { metricUrls } from "../../urls";

import { MetricPageShell } from "./MetricPageShell";

interface SetupOpts {
  card?: Card;
}

function setup({
  card = createMockCard({
    type: "metric",
    archived: true,
    can_delete: true,
  }),
}: SetupOpts = {}) {
  setupCollectionsEndpoints({ collections: [createMockCollection()] });
  setupMetricEndpoint(createMockMetric({ id: card.id }));
  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: card.id }, []);
  fetchMock.delete(`path:/api/card/${card.id}`, 200);

  const { router } = renderWithProviders(
    <Route
      path="/"
      element={<MetricPageShell card={card} urls={metricUrls} />}
    />,
    { withRouter: true, withUndos: true },
  );

  return { router };
}

describe("MetricPageShell", () => {
  it("navigates to /trash with a success toast after permanently deleting the metric", async () => {
    const { router } = setup();

    await userEvent.click(await screen.findByText("Delete permanently"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() => {
      expect(router?.location.pathname).toBe("/trash");
    });

    expect(
      screen.getByText("This item has been permanently deleted."),
    ).toBeInTheDocument();
  });

  it("offers no actions menu for a metric in a data app's collection", async () => {
    setup({
      card: createMockCard({
        type: "metric",
        can_write: true,
        collection: createMockCollection({ namespace: "data-apps" }),
      }),
    });

    expect(await screen.findByTestId("metric-header")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /More options/ }),
    ).not.toBeInTheDocument();
  });
});
