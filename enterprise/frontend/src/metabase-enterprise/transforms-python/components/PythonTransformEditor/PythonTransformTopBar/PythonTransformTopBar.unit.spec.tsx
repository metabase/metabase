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
  readOnly?: boolean;
  transformId?: number;
};

function setup({
  databaseId = 1,
  readOnly = false,
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
          readOnly={readOnly}
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
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("read-only mode", () => {
    it("should render EditDefinitionButton when readOnly is true", () => {
      setup({ readOnly: true, transformId: 1 });
      expect(
        screen.getByRole("link", { name: /edit definition/i }),
      ).toBeInTheDocument();
    });

    it("should display database name as static text when readOnly is true", async () => {
      setup({ readOnly: true, databaseId: 1 });
      // In read-only mode, database name is displayed as text, not a dropdown
      expect(await screen.findByText("Test Database")).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("should not render EditDefinitionButton when readOnly is false", () => {
      setup({ readOnly: false });
      expect(
        screen.queryByRole("link", { name: /edit definition/i }),
      ).not.toBeInTheDocument();
    });

    it("should render database selector when readOnly is false", () => {
      setup({ readOnly: false });
      expect(screen.getByTestId("selected-database")).toBeInTheDocument();
    });
  });
});
