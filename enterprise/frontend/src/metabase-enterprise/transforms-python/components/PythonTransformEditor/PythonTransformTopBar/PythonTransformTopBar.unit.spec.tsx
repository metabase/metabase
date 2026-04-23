import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Transform } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransform,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PythonTransformTopBar } from "./PythonTransformTopBar";

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
    "source-tables": [],
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
  describe("view mode (not editing)", () => {
    it("should render EditDefinitionButton when not in edit mode", () => {
      setup({ isEditMode: false, transform: mockPythonTransform });
      expect(
        screen.getByRole("link", { name: /edit definition/i }),
      ).toBeInTheDocument();
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
