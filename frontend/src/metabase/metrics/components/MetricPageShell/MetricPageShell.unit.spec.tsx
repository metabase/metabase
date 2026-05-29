import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupCollectionsEndpoints } from "__support__/server-mocks/collection";
import { setupMetricEndpoint } from "__support__/server-mocks/metric";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCard, createMockCollection } from "metabase-types/api/mocks";
import { createMockMetric } from "metabase-types/api/mocks/metric";

import { metricUrls } from "../../urls";

import { MetricPageShell } from "./MetricPageShell";

function setup() {
  const card = createMockCard({
    type: "metric",
    archived: true,
    can_delete: true,
  });

  setupCollectionsEndpoints({ collections: [createMockCollection()] });
  setupMetricEndpoint(createMockMetric({ id: card.id }));
  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: card.id }, []);
  fetchMock.delete(`path:/api/card/${card.id}`, 200);

  const { history } = renderWithProviders(
    <Route
      path="/"
      component={() => <MetricPageShell card={card} urls={metricUrls} />}
    />,
    { withRouter: true, withUndos: true },
  );

  return { history };
}

describe("MetricPageShell", () => {
  it("navigates to /trash with a success toast after permanently deleting the metric", async () => {
    const { history } = setup();

    await userEvent.click(await screen.findByText("Delete permanently"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe("/trash");
    });

    expect(
      screen.getByText("This item has been permanently deleted."),
    ).toBeInTheDocument();
  });
});
