import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupWorkspaceCheckoutEndpoint,
  setupWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { Transform } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransform,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PythonTransformTopBar } from "./PythonTransformTopBar";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

const DATABASE_ID = 1;
const mockDatabase = createMockDatabase({
  id: DATABASE_ID,
  name: "Test Database",
});

const mockPythonTransform = createMockTransform({
  id: 1,
  name: "Test Python Transform",
  source_type: "python",
  source: {
    type: "python",
    body: "def transform(): pass",
    "source-database": DATABASE_ID,
    "source-tables": {},
  },
});

type SetupOpts = {
  databaseId?: number;
  isEditMode?: boolean;
  transform?: Transform;
};

function setup({
  databaseId = DATABASE_ID,
  isEditMode = true,
  transform,
}: SetupOpts = {}) {
  const onDatabaseChange = jest.fn();

  setupDatabasesEndpoints([mockDatabase]);
  setupSearchEndpoints([]);
  setupWorkspacesEndpoint([]);
  setupWorkspaceCheckoutEndpoint({});

  renderWithProviders(
    <Route
      component={() => (
        <PythonTransformTopBar
          databaseId={databaseId}
          isEditMode={isEditMode}
          transform={transform}
          onDatabaseChange={onDatabaseChange}
        />
      )}
      path="/"
    />,
    {
      withRouter: true,
      initialRoute: "/",
      storeInitialState: createMockState(),
    },
  );

  return { onDatabaseChange };
}

describe("PythonTransformTopBar", () => {
  beforeEach(() => {
    mockHasPremiumFeature.mockReturnValue(false);
  });

  describe("view mode (not editing)", () => {
    it("should render EditDefinitionButton when not in edit mode and workspaces feature is disabled", () => {
      mockHasPremiumFeature.mockReturnValue(false);
      setup({ isEditMode: false, transform: mockPythonTransform });
      expect(
        screen.getByRole("link", { name: /edit definition/i }),
      ).toBeInTheDocument();
    });

    it("should render EditTransformMenu when not in edit mode and workspaces feature is enabled", async () => {
      mockHasPremiumFeature.mockImplementation(
        (feature) => feature === "workspaces",
      );
      setup({ isEditMode: false, transform: mockPythonTransform });

      const editButton = await screen.findByRole("button", { name: /Edit/i });
      await waitFor(() => {
        expect(editButton).not.toHaveAttribute("data-loading", "true");
      });

      await userEvent.click(editButton);

      expect(screen.getByText("Edit definition")).toBeInTheDocument();
      expect(screen.getByText("Add to workspace")).toBeInTheDocument();
    });

    it("should not render edit button when transform is not provided", () => {
      setup({ isEditMode: false, transform: undefined });
      expect(
        screen.queryByRole("link", { name: /edit definition/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Edit/i }),
      ).not.toBeInTheDocument();
    });

    it("should display database name as static text when not in edit mode", async () => {
      setup({ isEditMode: false, databaseId: DATABASE_ID });
      // When not in edit mode, database name is displayed as text, not a dropdown
      expect(await screen.findByText("Test Database")).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("should not render edit button in edit mode", () => {
      setup({ isEditMode: true, transform: mockPythonTransform });
      expect(
        screen.queryByRole("link", { name: /edit definition/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Edit/i }),
      ).not.toBeInTheDocument();
    });

    it("should render database selector in edit mode", () => {
      setup({ isEditMode: true });
      expect(screen.getByTestId("selected-database")).toBeInTheDocument();
    });
  });
});
