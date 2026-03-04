import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTablesEndpoints,
  setupWorkspaceCheckoutEndpoint,
  setupWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { PythonTransformEditorUiOptions } from "metabase/plugins/oss/transforms";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { PythonTransformSourceDraft, Transform } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockTransform,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PythonTransformEditor } from "./PythonTransformEditor";

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
const mockTable = createMockTable({
  id: 1,
  db_id: DATABASE_ID,
  name: "Test Table",
});

const mockPythonSource: PythonTransformSourceDraft = {
  type: "python",
  body: "# Python script\nprint('Hello, world!')",
  "source-database": DATABASE_ID,
  "source-tables": {},
};

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
  setupWorkspacesEndpoint([]);
  setupWorkspaceCheckoutEndpoint({});

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
});
