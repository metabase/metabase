import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
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
