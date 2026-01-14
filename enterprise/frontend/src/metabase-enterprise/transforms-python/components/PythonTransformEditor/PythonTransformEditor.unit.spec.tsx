import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { PythonTransformSourceDraft } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PythonTransformEditor } from "./PythonTransformEditor";

// Mock matchMedia to include matches property (required for ColorSchemeProvider)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock react-use hooks
jest.mock("react-use", () => ({
  ...jest.requireActual("react-use"),
  useWindowSize: () => ({ height: 800, width: 1200 }),
}));

// Mock the hooks
jest.mock("./hooks", () => ({
  useTestPythonTransform: () => ({
    isRunning: false,
    cancel: jest.fn(),
    run: jest.fn(),
    executionResult: null,
  }),
}));

// Mock child components to avoid deep dependency issues
jest.mock("./PythonEditorBody", () => ({
  PythonEditorBody: ({
    readOnly,
  }: {
    readOnly?: boolean;
    [key: string]: unknown;
  }) => (
    <div data-testid="python-editor-body">
      {!readOnly && <button data-testid="run-button">Run</button>}
    </div>
  ),
}));

jest.mock("./PythonEditorResults", () => ({
  PythonEditorResults: () => (
    <div data-testid="python-results">Results Panel</div>
  ),
}));

jest.mock("./PythonDataPicker", () => ({
  PythonDataPicker: () => (
    <div data-testid="python-data-picker">Data Picker</div>
  ),
}));

jest.mock("./PythonTransformTopBar", () => ({
  PythonTransformTopBar: ({
    readOnly,
    transformId,
  }: {
    readOnly?: boolean;
    transformId?: number;
    [key: string]: unknown;
  }) => (
    <div data-testid="python-transform-top-bar">
      {readOnly && transformId && (
        <a href="#" aria-label="Edit definition">
          Edit definition
        </a>
      )}
      {!readOnly && (
        <>
          <button aria-label="Import common library">Import</button>
          <button aria-label="Edit common library">Edit</button>
        </>
      )}
    </div>
  ),
}));

const mockDatabase = createMockDatabase({ id: 1, name: "Test Database" });

const mockPythonSource: PythonTransformSourceDraft = {
  type: "python",
  body: "# Python script\nprint('Hello, world!')",
  "source-database": 1,
  "source-tables": {},
};

type SetupOpts = {
  source?: PythonTransformSourceDraft;
  readOnly?: boolean;
  isDirty?: boolean;
  transformId?: number;
};

function setup({
  source = mockPythonSource,
  readOnly = false,
  isDirty = false,
  transformId = 1,
}: SetupOpts = {}) {
  const onChangeSource = jest.fn();
  const onAcceptProposed = jest.fn();
  const onRejectProposed = jest.fn();

  const mockTable = createMockTable({ id: 1, db_id: 1, name: "Test Table" });

  setupDatabasesEndpoints([mockDatabase]);
  setupSearchEndpoints([]);
  setupTableEndpoints(mockTable);

  renderWithProviders(
    <PythonTransformEditor
      source={source}
      readOnly={readOnly}
      isDirty={isDirty}
      transformId={transformId}
      onChangeSource={onChangeSource}
      onAcceptProposed={onAcceptProposed}
      onRejectProposed={onRejectProposed}
    />,
    {
      storeInitialState: createMockState(),
    },
  );

  return { onChangeSource, onAcceptProposed, onRejectProposed };
}

describe("PythonTransformEditor", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("read-only mode", () => {
    it("should not render the data picker sidebar when readOnly is true", () => {
      setup({ readOnly: true });
      expect(
        screen.queryByTestId("python-data-picker"),
      ).not.toBeInTheDocument();
    });

    it("should not render the results panel when readOnly is true", () => {
      setup({ readOnly: true });
      expect(screen.queryByTestId("python-results")).not.toBeInTheDocument();
    });

    it("should render the top bar", () => {
      setup({ readOnly: true });
      expect(
        screen.getByTestId("python-transform-top-bar"),
      ).toBeInTheDocument();
    });

    it("should render EditDefinitionButton in read-only mode", () => {
      setup({ readOnly: true, transformId: 1 });
      expect(
        screen.getByRole("link", { name: /edit definition/i }),
      ).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("should render the data picker sidebar when readOnly is false", async () => {
      setup({ readOnly: false });
      expect(
        await screen.findByTestId("python-data-picker"),
      ).toBeInTheDocument();
    });

    it("should render the results panel when readOnly is false", () => {
      setup({ readOnly: false });
      expect(screen.getByTestId("python-results")).toBeInTheDocument();
    });

    it("should render the top bar", () => {
      setup({ readOnly: false });
      expect(
        screen.getByTestId("python-transform-top-bar"),
      ).toBeInTheDocument();
    });

    it("should not render EditDefinitionButton in edit mode", () => {
      setup({ readOnly: false });
      expect(
        screen.queryByRole("link", { name: /edit definition/i }),
      ).not.toBeInTheDocument();
    });

    it("should render library buttons in edit mode", () => {
      setup({ readOnly: false });
      expect(
        screen.getByLabelText(/import common library/i),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/edit common library/i)).toBeInTheDocument();
    });
  });
});
