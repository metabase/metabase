import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { PythonTransformSourceDraft } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PythonTransformEditor } from "./PythonTransformEditor";

const mockDatabase = createMockDatabase({ id: 1, name: "Test Database" });
const mockTable = createMockTable({ id: 1, db_id: 1, name: "Test Table" });

const mockPythonSource: PythonTransformSourceDraft = {
  type: "python",
  body: "# Python script\nprint('Hello, world!')",
  "source-database": 1,
  "source-tables": {},
};

type SetupOpts = {
  source?: PythonTransformSourceDraft;
  isEditMode?: boolean;
  transformId?: number;
};

function setup({
  source = mockPythonSource,
  isEditMode = true,
  transformId = 1,
}: SetupOpts = {}) {
  setupDatabasesEndpoints([mockDatabase]);
  setupTablesEndpoints([mockTable]);
  setupSearchEndpoints([]);

  renderWithProviders(
    <PythonTransformEditor
      source={source}
      isEditMode={isEditMode}
      transformId={transformId}
      onChangeSource={jest.fn()}
      onAcceptProposed={jest.fn()}
      onRejectProposed={jest.fn()}
    />,
    {
      storeInitialState: createMockState(),
    },
  );
}

describe("PythonTransformEditor", () => {
  describe("view mode (not editing)", () => {
    it("should not render the data picker sidebar when not in edit mode", () => {
      setup({ isEditMode: false });
      expect(
        screen.queryByTestId("python-data-picker"),
      ).not.toBeInTheDocument();
    });

    it("should not render the results panel when not in edit mode", () => {
      setup({ isEditMode: false });
      expect(screen.queryByTestId("python-results")).not.toBeInTheDocument();
    });

    it("should render the top bar", () => {
      setup({ isEditMode: false });
      expect(
        screen.getByTestId("python-transform-top-bar"),
      ).toBeInTheDocument();
    });

    it("should render EditDefinitionButton when not in edit mode", () => {
      setup({ isEditMode: false, transformId: 1 });
      expect(screen.getByText(/edit definition/i)).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("should render the data picker sidebar in edit mode", async () => {
      setup({ isEditMode: true });
      expect(
        await screen.findByTestId("python-data-picker"),
      ).toBeInTheDocument();
    });

    it("should render the results panel in edit mode", () => {
      setup({ isEditMode: true });
      expect(screen.getByTestId("python-results")).toBeInTheDocument();
    });

    it("should render the top bar", () => {
      setup({ isEditMode: true });
      expect(
        screen.getByTestId("python-transform-top-bar"),
      ).toBeInTheDocument();
    });

    it("should not render EditDefinitionButton in edit mode", () => {
      setup({ isEditMode: true });
      expect(screen.queryByText(/edit definition/i)).not.toBeInTheDocument();
    });
  });
});
