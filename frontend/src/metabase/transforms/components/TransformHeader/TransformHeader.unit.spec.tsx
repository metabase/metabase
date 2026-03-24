import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { createMockTransform } from "metabase-types/api/mocks";

import { TransformHeader } from "./TransformHeader";

type SetupOpts = {
  hasMenu?: boolean;
  isEditMode?: boolean;
};

function setup({ hasMenu = true, isEditMode = false }: SetupOpts = {}) {
  const transform = createMockTransform({ id: 1, name: "Test Transform" });

  renderWithProviders(
    <Route
      component={() => (
        <TransformHeader
          transform={transform}
          hasMenu={hasMenu}
          isEditMode={isEditMode}
        />
      )}
      path="/"
    />,
    {
      withRouter: true,
      initialRoute: "/",
    },
  );

  return { transform };
}

describe("TransformHeader", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("tabs visibility", () => {
    it("should render tabs when isEditMode is false", () => {
      setup({ isEditMode: false });

      expect(
        screen.getByRole("link", { name: "Definition" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Run" })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Settings" }),
      ).toBeInTheDocument();
    });

    it("should not render tabs when isEditMode is true", () => {
      setup({ isEditMode: true });

      expect(
        screen.queryByRole("link", { name: "Definition" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Run" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Target" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("inspect tab upsell", () => {
    it("should always render the Inspect tab", () => {
      setup();

      expect(screen.getByText("Inspect")).toBeInTheDocument();
    });

    it("should show upsell gem when transforms-python is not enabled", () => {
      setup();

      const inspectLink = screen.getByText("Inspect").closest("a");
      expect(inspectLink).toBeInTheDocument();

      const upsellGems = screen.queryAllByTestId("upsell-gem");
      const inspectUpsellGems = upsellGems.filter((gem) =>
        inspectLink?.contains(gem),
      );
      expect(inspectUpsellGems.length).toBeGreaterThan(0);
    });

    it("should not show upsell gem when transforms-python is enabled", () => {
      const original = PLUGIN_TRANSFORMS_PYTHON.isEnabled;
      PLUGIN_TRANSFORMS_PYTHON.isEnabled = true;

      try {
        setup();

        const inspectLink = screen.getByText("Inspect").closest("a");
        expect(inspectLink).toBeInTheDocument();

        const upsellGems = screen.queryAllByTestId("upsell-gem");
        const inspectUpsellGems = upsellGems.filter((gem) =>
          inspectLink?.contains(gem),
        );
        expect(inspectUpsellGems).toHaveLength(0);
      } finally {
        PLUGIN_TRANSFORMS_PYTHON.isEnabled = original;
      }
    });
  });

  describe("menu visibility", () => {
    it("should render menu when hasMenu is true", () => {
      setup({ hasMenu: true });
      expect(screen.getByLabelText("ellipsis icon")).toBeInTheDocument();
    });

    it("should not render menu when hasMenu is false", () => {
      setup({ hasMenu: false });
      expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
    });
  });
});
