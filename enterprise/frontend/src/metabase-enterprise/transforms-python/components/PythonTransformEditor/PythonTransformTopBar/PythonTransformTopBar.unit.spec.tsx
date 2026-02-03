import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PythonTransformTopBar } from "./PythonTransformTopBar";

const mockDatabase = createMockDatabase({ id: 1, name: "Test Database" });

type SetupOpts = {
  databaseId?: number;
  isEditMode?: boolean;
  transformId?: number;
};

function setup({
  databaseId = 1,
  isEditMode = true,
  transformId = 1,
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
          transformId={transformId}
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
      setup({ isEditMode: false, transformId: 1 });
      expect(
        screen.getByRole("link", { name: /edit definition/i }),
      ).toBeInTheDocument();
    });

    it("should display database name as static text when not in edit mode", async () => {
      setup({ isEditMode: false, databaseId: 1 });
      // When not in edit mode, database name is displayed as text, not a dropdown
      expect(await screen.findByText("Test Database")).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("should not render EditDefinitionButton in edit mode", () => {
      setup({ isEditMode: true });
      expect(
        screen.queryByRole("link", { name: /edit definition/i }),
      ).not.toBeInTheDocument();
    });

    it("should render database selector in edit mode", () => {
      setup({ isEditMode: true });
      expect(screen.getByTestId("selected-database")).toBeInTheDocument();
    });
  });
});
