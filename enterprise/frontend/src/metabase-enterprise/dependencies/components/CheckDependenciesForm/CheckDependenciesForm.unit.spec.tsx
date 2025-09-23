import { Route } from "react-router";

import { getIcon, renderWithProviders, screen } from "__support__/ui";
import type { IconName } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import type {
  CardDisplayType,
  CardType,
  CheckDependenciesResponse,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCheckDependenciesResponse,
} from "metabase-types/api/mocks";

import { CheckDependenciesForm } from "./CheckDependenciesForm";

type SetupOpts = {
  checkData?: CheckDependenciesResponse;
};

function setup({
  checkData = createMockCheckDependenciesResponse(),
}: SetupOpts) {
  const onSave = jest.fn();
  const onCancel = jest.fn();
  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <CheckDependenciesForm
          checkData={checkData}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    />,
    { withRouter: true, initialRoute: "/" },
  );
  return { onSave, onCancel };
}

registerVisualizations();

describe("CheckDependenciesForm", () => {
  describe.each<CardType>(["question", "model", "metric"])("%s", (type) => {
    it("should display broken cards", () => {
      setup({
        checkData: createMockCheckDependenciesResponse({
          success: false,
          bad_cards: [
            createMockCard({
              name: "Card",
              type,
            }),
          ],
        }),
      });
      expect(screen.getByText("Card")).toBeInTheDocument();
    });
  });

  it.each<{ display: CardDisplayType; icon: IconName }>([
    { display: "line", icon: "line" },
    { display: "pie", icon: "pie" },
  ])(
    "should display the icon that corresponds to the display type",
    ({ display, icon }) => {
      setup({
        checkData: createMockCheckDependenciesResponse({
          success: false,
          bad_cards: [
            createMockCard({
              type: "question",
              display,
            }),
          ],
        }),
      });
      expect(getIcon(icon)).toBeInTheDocument();
    },
  );
});
