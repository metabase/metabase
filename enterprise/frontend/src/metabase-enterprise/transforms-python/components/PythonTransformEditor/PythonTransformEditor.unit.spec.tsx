import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { PythonTransformEditorUiOptions } from "metabase/plugins/oss/transforms";
import { createMockState } from "metabase/redux/store/mocks";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { PythonTransformSourceDraft, Transform } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockTransform,
} from "metabase-types/api/mocks";

import { PythonTransformEditor } from "./PythonTransformEditor";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

// Unjustified type cast. FIXME
const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

const DATABASE_ID = 1;
const mockDatabase = createMockDatabase({
  id: DATABASE_ID,
  name: "Test Database",
});
const mockTable = createMockTable({
  id: 1,
  db_id: DATABASE_ID,
  name: "Test Table",
});

const mockPythonSource: PythonTransformSourceDraft = {
  type: "python",
  body: "# Python script\nprint('Hello, world!')",
  "source-database": DATABASE_ID,
  "source-tables": [],
};

const mockPythonSourceWithTable: PythonTransformSourceDraft = {
  ...mockPythonSource,
  "source-tables": [
    { alias: "test_table", table_id: 1, database_id: DATABASE_ID },
  ],
};

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
  source?: PythonTransformSourceDraft;
  isEditMode?: boolean;
  transform?: Transform;
  uiOptions?: PythonTransformEditorUiOptions;
};

function setup({
  source = mockPythonSource,
  isEditMode = true,
  transform,
  uiOptions,
}: SetupOpts = {}) {
  setupDatabasesEndpoints([mockDatabase]);
  setupTablesEndpoints([mockTable]);
  setupSearchEndpoints([]);

  renderWithProviders(
    <PythonTransformEditor
      source={source}
      isEditMode={isEditMode}
      transform={transform}
      uiOptions={uiOptions}
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
  beforeEach(() => {
    mockHasPremiumFeature.mockReturnValue(false);
  });

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
      setup({ isEditMode: false, transform: mockPythonTransform });
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

  describe("hideRunButton option", () => {
    it("should render run button when hideRunButton is not set", () => {
      setup({ isEditMode: true });
      expect(screen.getByTestId("run-button")).toBeInTheDocument();
    });

    it("should render run button when hideRunButton is false", () => {
      setup({ isEditMode: true, uiOptions: { hideRunButton: false } });
      expect(screen.getByTestId("run-button")).toBeInTheDocument();
    });

    it("should not render run button when hideRunButton is true", () => {
      setup({ isEditMode: true, uiOptions: { hideRunButton: true } });
      expect(screen.queryByTestId("run-button")).not.toBeInTheDocument();
    });
  });

  describe("running the script", () => {
    beforeEach(() => {
      fetchMock.post("path:/api/ee/transforms-python/test-run", {
        logs: "",
        output: { cols: [{ name: "foo" }], rows: [[1]] },
      });
    });

    it("should disable the run button when no source tables are selected", async () => {
      setup({ isEditMode: true });
      const runButton = screen.getByTestId("run-button");
      expect(runButton).toBeDisabled();

      await userEvent.click(runButton);
      expect(
        fetchMock.callHistory.calls("path:/api/ee/transforms-python/test-run"),
      ).toHaveLength(0);
    });

    it("should run the script when a source table is selected", async () => {
      setup({ isEditMode: true, source: mockPythonSourceWithTable });
      const runButton = screen.getByTestId("run-button");
      expect(runButton).toBeEnabled();

      await userEvent.click(runButton);
      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(
            "path:/api/ee/transforms-python/test-run",
          ),
        ).toHaveLength(1);
      });
    });
  });
});
