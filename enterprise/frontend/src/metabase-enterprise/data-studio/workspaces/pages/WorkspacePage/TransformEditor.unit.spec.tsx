import {
  setupAdhocQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTablesEndpoints,
  setupWorkspaceCheckoutEndpoint,
  setupWorkspacesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import type { DraftTransformSource } from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockDatabase,
  createMockTable,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TransformEditor } from "./TransformEditor";

type UiOptions = {
  hideRunButton?: boolean;
};

type MockProps = {
  uiOptions?: UiOptions;
};

// Mock the TransformQueryPageEditor to capture uiOptions
const mockTransformQueryPageEditor = jest.fn((_props: MockProps) => (
  <div data-testid="mock-transform-query-page-editor" />
));

jest.mock(
  "metabase-enterprise/transforms/pages/TransformQueryPage/TransformQueryPage",
  () => ({
    TransformQueryPageEditor: (props: MockProps) =>
      mockTransformQueryPageEditor(props),
  }),
);

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

const mockNativeSource: DraftTransformSource = {
  type: "query",
  query: {
    type: "native",
    database: DATABASE_ID,
    native: {
      query: "SELECT * FROM test_table",
    },
  },
};

type SetupOpts = {
  source?: DraftTransformSource;
  hideRunButton?: boolean;
  disabled?: boolean;
};

function setup({
  source = mockNativeSource,
  hideRunButton = false,
  disabled = false,
}: SetupOpts = {}) {
  setupDatabasesEndpoints([mockDatabase]);
  setupTablesEndpoints([mockTable]);
  setupSearchEndpoints([]);
  setupWorkspacesEndpoint([]);
  setupWorkspaceCheckoutEndpoint({});
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [mockDatabase] }),
  );

  mockTransformQueryPageEditor.mockClear();

  renderWithProviders(
    <TransformEditor
      source={source}
      hideRunButton={hideRunButton}
      disabled={disabled}
      onChange={jest.fn()}
      onAcceptProposed={jest.fn()}
      onRejectProposed={jest.fn()}
    />,
    {
      storeInitialState: createMockState(),
    },
  );
}

function getLastUiOptions(): UiOptions | undefined {
  const calls = mockTransformQueryPageEditor.mock.calls;
  if (calls.length === 0) {
    return undefined;
  }
  const lastCall = calls[calls.length - 1];
  return lastCall[0]?.uiOptions;
}

describe("TransformEditor", () => {
  describe("hideRunButton prop", () => {
    it("should not hide run button when hideRunButton is false", () => {
      setup({ hideRunButton: false });
      const uiOptions = getLastUiOptions();
      expect(uiOptions?.hideRunButton).toBe(false);
    });

    it("should hide run button when hideRunButton is true", () => {
      setup({ hideRunButton: true });
      const uiOptions = getLastUiOptions();
      expect(uiOptions?.hideRunButton).toBe(true);
    });
  });
});
