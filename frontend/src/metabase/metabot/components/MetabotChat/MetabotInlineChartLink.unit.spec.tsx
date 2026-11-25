import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardEndpoints } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { markChartSaved } from "metabase/metabot/state";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockCard } from "metabase-types/api/mocks";

import { MetabotInlineChartLink } from "./MetabotInlineChartLink";

const CARD: GeneratedCard = {
  type: "card",
  id: "chart-a",
  title: "Orders by month",
  query: {
    id: "query-a",
    query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  },
};

interface SetupOpts {
  savedCardId?: number;
}

const setup = ({ savedCardId }: SetupOpts = {}) => {
  const { store } = renderWithProviders(
    <Route path="*" element={<MetabotInlineChartLink value={CARD} />} />,
    { withRouter: true },
  );
  if (savedCardId != null) {
    act(() => {
      store.dispatch(
        markChartSaved({ entityId: CARD.id, cardId: savedCardId }),
      );
    });
  }
  return { store };
};

describe("MetabotInlineChartLink", () => {
  it("links to the chart Metabot generated", () => {
    setup();

    expect(
      screen.getByRole("link", { name: "Orders by month" }),
    ).toHaveAttribute("href", Urls.generatedCard(CARD));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("tells the query builder that Metabot is opening the chart", async () => {
    const { store } = setup();

    await userEvent.click(
      screen.getByRole("link", { name: "Orders by month" }),
    );

    expect(store.getState().qb.pendingMetabotCard).toEqual({
      url: Urls.generatedCard(CARD),
    });
  });

  it("links to the saved question once the chart is saved", async () => {
    setupCardEndpoints(createMockCard({ id: 501, metabot_chart_id: CARD.id }));
    setup({ savedCardId: 501 });

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Orders by month" }),
    ).toHaveAttribute("href", Urls.card({ id: 501, name: "Orders by month" }));
  });

  it("links to the generated chart again when the saved question is gone", async () => {
    fetchMock.get("path:/api/card/501", { status: 404 });
    setup({ savedCardId: 501 });

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Orders by month" }),
      ).toHaveAttribute("href", Urls.generatedCard(CARD)),
    );
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});
