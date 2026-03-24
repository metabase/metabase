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

      expect(screen.getByRole("link", { name: /Inspect/ })).toBeInTheDocument();
    });

    it("should show upsell gem when transforms-python is not enabled", () => {
      setup();

      const inspectLink = screen.getByRole("link", { name: /Inspect/ });
      const upsellGem = inspectLink.querySelector('[data-testid="upsell-gem"]');
      expect(upsellGem).toBeInTheDocument();
    });

    it("should not show upsell gem when transforms-python is enabled", () => {
      const original = PLUGIN_TRANSFORMS_PYTHON.isEnabled;
      PLUGIN_TRANSFORMS_PYTHON.isEnabled = true;

      try {
        setup();

        expect(
          screen.getByRole("link", { name: "Inspect" }),
        ).toBeInTheDocument();
        const inspectLink = screen.getByRole("link", { name: "Inspect" });
        const upsellGem = inspectLink.querySelector(
          '[data-testid="upsell-gem"]',
        );
        expect(upsellGem).not.toBeInTheDocument();
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
