import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Route } from "metabase/router";
import type { Collection, CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockTransform,
} from "metabase-types/api/mocks";

import { TransformHeader } from "./TransformHeader";

type SetupOpts = {
  hasMenu?: boolean;
  isEditMode?: boolean;
  collectionId?: CollectionId | null;
  collections?: Collection[];
};

function setup({
  hasMenu = true,
  isEditMode = false,
  collectionId = null,
  collections = [createMockCollection({ id: "root", name: "Transforms" })],
}: SetupOpts = {}) {
  const transform = createMockTransform({
    id: 1,
    name: "Test Transform",
    collection_id: typeof collectionId === "number" ? collectionId : null,
  });

  setupUserMetabotPermissionsEndpoint();
  setupCollectionByIdEndpoint({ collections });

  renderWithProviders(
    <Route
      element={
        <TransformHeader
          transform={transform}
          hasMenu={hasMenu}
          isEditMode={isEditMode}
        />
      }
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
        screen.queryByRole("link", { name: "Settings" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("inspect tab upsell", () => {
    it("should not render the Inspect tab for oss", () => {
      setup();

      expect(screen.queryByText("Inspect")).not.toBeInTheDocument();
    });

    it("should show upsell gem when transforms-python is not enabled", () => {
      setupEnterprisePlugins();
      setup();

      const inspectLink = screen.getByRole("link", { name: /Inspect/ });
      expect(inspectLink).toBeInTheDocument();

      expect(within(inspectLink).getByTestId("upsell-gem")).toBeInTheDocument();
    });

    it("should not show upsell gem when transforms-python is enabled", () => {
      setupEnterprisePlugins();
      PLUGIN_TRANSFORMS_PYTHON.isEnabled = true;

      setup();

      const inspectLink = screen.getByRole("link", { name: "Inspect" });
      expect(inspectLink).toBeInTheDocument();

      expect(
        within(inspectLink).queryByTestId("upsell-gem"),
      ).not.toBeInTheDocument();
    });
  });

  describe("breadcrumbs", () => {
    it("shows a single Data transformation crumb for a transform in the root collection", async () => {
      setup();

      const breadcrumbs = await screen.findByTestId("data-studio-breadcrumbs");
      await waitFor(() => {
        expect(within(breadcrumbs).getByText("Test Transform")).toBeVisible();
      });
      expect(
        within(breadcrumbs).getAllByText("Data transformation"),
      ).toHaveLength(1);
    });

    it("shows the folder path between the Data transformation crumb and the name", async () => {
      setup({
        collectionId: 2,
        collections: [
          createMockCollection({
            id: 2,
            name: "Marketing",
            effective_ancestors: [
              createMockCollection({ id: "root", name: "Transforms" }),
            ],
          }),
        ],
      });

      const breadcrumbs = await screen.findByTestId("data-studio-breadcrumbs");
      await waitFor(() => {
        expect(within(breadcrumbs).getByText("Marketing")).toBeInTheDocument();
      });
      expect(
        within(breadcrumbs).getAllByText("Data transformation"),
      ).toHaveLength(1);
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
