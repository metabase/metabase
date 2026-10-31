import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Card, Dashboard, UnreadableCard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

import { DashboardContentsSection } from "./DashboardContentsSection";

type SetupOpts = {
  dashboard: Dashboard;
};

const setup = ({ dashboard }: SetupOpts) => {
  renderWithProviders(
    <Route
      path="*"
      element={<DashboardContentsSection dashboard={dashboard} />}
    />,
    { withRouter: true },
  );
};

const getRows = () =>
  within(screen.getByRole("list", { name: "Contents" })).queryAllByRole(
    "listitem",
  );

describe("DashboardContentsSection", () => {
  it("shows an empty state when the dashboard has no saved cards", () => {
    setup({
      dashboard: createMockDashboard({
        dashcards: [createMockTextDashboardCard({ text: "just text" })],
      }),
    });

    expect(
      screen.getByText(
        "This dashboard doesn't have any questions, models, or metrics.",
      ),
    ).toBeInTheDocument();
    expect(getRows()).toHaveLength(0);
  });

  it("lists each card once across all tabs, ordered by type then name", () => {
    const question = createMockCard({ id: 1, name: "Zeta question" });
    const anotherQuestion = createMockCard({ id: 2, name: "Alpha question" });
    const model = createMockCard({ id: 3, name: "A model", type: "model" });
    const metric = createMockCard({ id: 4, name: "A metric", type: "metric" });
    const tabs = [
      createMockDashboardTab({ id: 1 }),
      createMockDashboardTab({ id: 2 }),
    ];
    setup({
      dashboard: createMockDashboard({
        tabs,
        dashcards: [
          createMockDashboardCard({
            id: 1,
            dashboard_tab_id: 1,
            card_id: metric.id,
            card: metric,
          }),
          createMockDashboardCard({
            id: 2,
            dashboard_tab_id: 1,
            card_id: question.id,
            card: question,
          }),
          createMockDashboardCard({
            id: 3,
            dashboard_tab_id: 2,
            card_id: question.id,
            card: question,
          }),
          createMockDashboardCard({
            id: 4,
            dashboard_tab_id: 2,
            card_id: model.id,
            card: model,
          }),
          createMockDashboardCard({
            id: 5,
            dashboard_tab_id: 2,
            card_id: anotherQuestion.id,
            card: anotherQuestion,
          }),
          createMockTextDashboardCard({ id: 6, text: "ignored" }),
        ],
      }),
    });

    expect(getRows().map((row) => row.textContent)).toEqual([
      "Alpha questionQuestion",
      "Zeta questionQuestion",
      "A modelModel",
      "A metricMetric",
    ]);
  });

  it("leaves out the cards the viewer cannot read", () => {
    const question = createMockCard({ id: 1, name: "Readable question" });
    const restricted: UnreadableCard = { id: 2 };
    setup({
      dashboard: createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            card_id: question.id,
            card: question,
          }),
          createMockDashboardCard({
            id: 2,
            card_id: restricted.id,
            // GET /api/dashboard/:id sends only the id of a card the viewer
            // cannot read, but QuestionDashboardCard types `card` as a full Card.
            card: restricted as Card,
          }),
        ],
      }),
    });

    expect(getRows().map((row) => row.textContent)).toEqual([
      "Readable questionQuestion",
    ]);
  });

  it("links each row to its card", () => {
    const question = createMockCard({ id: 1, name: "My question" });
    const model = createMockCard({ id: 3, name: "My model", type: "model" });
    setup({
      dashboard: createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            card_id: question.id,
            card: question,
          }),
          createMockDashboardCard({ id: 2, card_id: model.id, card: model }),
        ],
      }),
    });

    expect(screen.getByRole("link", { name: /My question/ })).toHaveAttribute(
      "href",
      Urls.card(question),
    );
    expect(screen.getByRole("link", { name: /My model/ })).toHaveAttribute(
      "href",
      Urls.card(model),
    );
  });
});
