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
  readOnly?: boolean;
  transformId?: number;
};

function setup({
  source = mockPythonSource,
  readOnly = false,
  transformId = 1,
}: SetupOpts = {}) {
  const onChangeSource = jest.fn();
  const onAcceptProposed = jest.fn();
  const onRejectProposed = jest.fn();

  setupDatabasesEndpoints([mockDatabase]);
  setupTablesEndpoints([mockTable]);
  setupSearchEndpoints([]);

  renderWithProviders(
    <PythonTransformEditor
      source={source}
      readOnly={readOnly}
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
      expect(screen.getByText(/edit definition/i)).toBeInTheDocument();
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
      expect(screen.queryByText(/edit definition/i)).not.toBeInTheDocument();
    });
  });
});
