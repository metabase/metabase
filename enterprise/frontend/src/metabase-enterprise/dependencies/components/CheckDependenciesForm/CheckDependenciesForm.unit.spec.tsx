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
  createMockCollection,
  createMockTransform,
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
      expect(screen.getByRole("link", { name: /Card/ })).toHaveAttribute(
        "href",
        `/${type}/1-card`,
      );
    });

    it("should display the root collection", () => {
      setup({
        checkData: createMockCheckDependenciesResponse({
          success: false,
          bad_cards: [
            createMockCard({
              name: "Card",
              type,
              collection: createMockCollection({
                id: "root",
                name: "Our analytics",
              }),
            }),
          ],
        }),
      });
      expect(
        screen.getByRole("link", { name: "Our analytics" }),
      ).toHaveAttribute("href", "/collection/root");
    });

    it("should display the nested collection with parent collections", () => {
      setup({
        checkData: createMockCheckDependenciesResponse({
          success: false,
          bad_cards: [
            createMockCard({
              name: "Card",
              type,
              collection: createMockCollection({
                id: 2,
                name: "Second collection",
                effective_ancestors: [
                  createMockCollection({ id: 1, name: "First collection" }),
                  createMockCollection({ id: "root", name: "Our analytics" }),
                ],
              }),
            }),
          ],
        }),
      });
      expect(
        screen.getByRole("link", { name: "Our analytics" }),
      ).toHaveAttribute("href", "/collection/root");
      expect(
        screen.getByRole("link", { name: "First collection" }),
      ).toHaveAttribute("href", "/collection/1-first-collection");
      expect(
        screen.getByRole("link", { name: "Second collection" }),
      ).toHaveAttribute("href", "/collection/2-second-collection");
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

  it("should display the dashboard that the question belongs to", () => {
    setup({
      checkData: createMockCheckDependenciesResponse({
        success: false,
        bad_cards: [
          createMockCard({
            name: "Card",
            type: "question",
            collection: createMockCollection({
              id: 1,
              name: "First collection",
              effective_ancestors: [
                createMockCollection({ id: "root", name: "Our analytics" }),
              ],
            }),
            dashboard: {
              id: 2,
              name: "Card dashboard",
            },
          }),
        ],
      }),
    });
    expect(screen.getByRole("link", { name: "Our analytics" })).toHaveAttribute(
      "href",
      "/collection/root",
    );
    expect(
      screen.getByRole("link", { name: "First collection" }),
    ).toHaveAttribute("href", "/collection/1-first-collection");
    expect(
      screen.getByRole("link", { name: "Card dashboard" }),
    ).toHaveAttribute("href", "/dashboard/2-card-dashboard");
  });

  it("should display the document that the question belongs to", () => {
    setup({
      checkData: createMockCheckDependenciesResponse({
        success: false,
        bad_cards: [
          createMockCard({
            name: "Card",
            type: "question",
            collection: createMockCollection({
              id: 1,
              name: "First collection",
              effective_ancestors: [
                createMockCollection({ id: "root", name: "Our analytics" }),
              ],
            }),
            document: {
              id: 3,
              name: "Card document",
            },
          }),
        ],
      }),
    });
    expect(screen.getByRole("link", { name: "Our analytics" })).toHaveAttribute(
      "href",
      "/collection/root",
    );
    expect(
      screen.getByRole("link", { name: "First collection" }),
    ).toHaveAttribute("href", "/collection/1-first-collection");
    expect(screen.getByRole("link", { name: "Card document" })).toHaveAttribute(
      "href",
      "/document/3",
    );
  });

  it("should display transforms", () => {
    setup({
      checkData: createMockCheckDependenciesResponse({
        success: false,
        bad_transforms: [
          createMockTransform({
            id: 1,
            name: "SQL transform",
          }),
        ],
      }),
    });
    expect(screen.getByRole("link", { name: /SQL transform/ })).toHaveAttribute(
      "href",
      "/data-studio/transforms/1",
    );
  });
});
