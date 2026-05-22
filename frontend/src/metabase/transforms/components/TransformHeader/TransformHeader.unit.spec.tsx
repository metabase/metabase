import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import {
  createMockCollection,
  createMockTransform,
} from "metabase-types/api/mocks";

import { TransformHeader } from "./TransformHeader";

type SetupOpts = {
  hasMenu?: boolean;
  isEditMode?: boolean;
};

async function setup({ hasMenu = true, isEditMode = false }: SetupOpts = {}) {
  const transform = createMockTransform({ id: 1, name: "Test Transform" });

  setupUserMetabotPermissionsEndpoint();
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });

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

  // The breadcrumbs are hidden until the collection-path query resolves;
  // waiting for them lets the header's mount-time queries settle inside `act`.
  await waitFor(() =>
    expect(screen.getByTestId("data-studio-breadcrumbs")).toBeVisible(),
  );

  return { transform };
}

describe("TransformHeader", () => {
  describe("tabs visibility", () => {
    it("should render tabs when isEditMode is false", async () => {
      await setup({ isEditMode: false });

      expect(
        screen.getByRole("link", { name: "Definition" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Run" })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Settings" }),
      ).toBeInTheDocument();
    });

    it("should not render tabs when isEditMode is true", async () => {
      await setup({ isEditMode: true });

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
    it("should not render the Inspect tab for oss", async () => {
      await setup();

      expect(screen.queryByText("Inspect")).not.toBeInTheDocument();
    });

    it("should show upsell gem when transforms-python is not enabled", async () => {
      setupEnterprisePlugins();
      await setup();

      const inspectLink = screen.getByRole("link", { name: /Inspect/ });
      expect(inspectLink).toBeInTheDocument();

      expect(within(inspectLink).getByTestId("upsell-gem")).toBeInTheDocument();
    });

    it("should not show upsell gem when transforms-python is enabled", async () => {
      setupEnterprisePlugins();
      PLUGIN_TRANSFORMS_PYTHON.isEnabled = true;

      await setup();

      const inspectLink = screen.getByRole("link", { name: "Inspect" });
      expect(inspectLink).toBeInTheDocument();

      expect(
        within(inspectLink).queryByTestId("upsell-gem"),
      ).not.toBeInTheDocument();
    });
  });

  describe("menu visibility", () => {
    it("should render menu when hasMenu is true", async () => {
      await setup({ hasMenu: true });
      expect(screen.getByLabelText("ellipsis icon")).toBeInTheDocument();
    });

    it("should not render menu when hasMenu is false", async () => {
      await setup({ hasMenu: false });
      expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
    });
  });
});
