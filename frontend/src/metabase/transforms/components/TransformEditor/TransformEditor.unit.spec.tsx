import type { ReactNode } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import type { QueryEditorUiOptions } from "metabase/querying/editor/types";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type {
  EnterpriseSettings,
  QueryTransformSource,
  Transform,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockStructuredDatasetQuery,
  createMockTokenFeatures,
  createMockTransform,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { TransformEditor } from "./TransformEditor";

type QueryEditorMockProps = {
  uiOptions?: QueryEditorUiOptions;
  topBarInnerContent?: ReactNode;
};

jest.mock("metabase/querying/editor/components/QueryEditor", () => ({
  ...jest.requireActual("metabase/querying/editor/components/QueryEditor"),
  QueryEditor: ({ uiOptions, topBarInnerContent }: QueryEditorMockProps) => (
    <div
      data-testid="query-editor"
      data-read-only={String(uiOptions?.readOnly ?? false)}
      data-hide-run-button={String(uiOptions?.hideRunButton ?? false)}
    >
      {topBarInnerContent}
    </div>
  ),
}));

const SOURCE: QueryTransformSource = {
  type: "query",
  query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: { "source-table": ORDERS_ID },
  }),
};

const MAIN_TRANSFORM = createMockTransform({ id: 1 });

const BRANCH_TRANSFORM = createMockTransform({
  id: 2,
  worktree_id: 7,
  can_execute: false,
});

type SetupOpts = {
  transform?: Transform;
  isEditMode?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

function setup({
  transform = MAIN_TRANSFORM,
  isEditMode = false,
  remoteSyncType = "read-write",
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "remote-sync-type": remoteSyncType,
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });

  setupEnterprisePlugins();

  renderWithProviders(
    <Route
      path="/"
      element={
        <TransformEditor
          source={SOURCE}
          proposedSource={undefined}
          uiState={getInitialUiState()}
          databases={[createMockDatabase({ id: SAMPLE_DB_ID })]}
          transform={transform}
          isEditMode={isEditMode}
          onChangeSource={jest.fn()}
          onChangeUiState={jest.fn()}
          onAcceptProposed={jest.fn()}
          onRejectProposed={jest.fn()}
        />
      }
    />,
    {
      withRouter: true,
      initialRoute: "/",
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
        settings: mockSettings(settings),
      }),
    },
  );
}

describe("TransformEditor", () => {
  describe.each([
    ["a main-branch transform", MAIN_TRANSFORM],
    ["a branch transform the backend refuses to run", BRANCH_TRANSFORM],
  ])("with %s", (_label, transform) => {
    it("runs the query ad hoc while editing", () => {
      setup({ transform, isEditMode: true });

      const editor = screen.getByTestId("query-editor");
      expect(editor).toHaveAttribute("data-read-only", "false");
      expect(editor).toHaveAttribute("data-hide-run-button", "false");
    });

    it("keeps the query previewable while viewing", () => {
      setup({ transform, isEditMode: false });

      const editor = screen.getByTestId("query-editor");
      expect(editor).toHaveAttribute("data-read-only", "true");
      expect(editor).toHaveAttribute("data-hide-run-button", "false");
    });
  });

  it("offers editing a branch transform on a read-only instance", () => {
    setup({ transform: BRANCH_TRANSFORM, remoteSyncType: "read-only" });

    expect(screen.getByTestId("edit-definition-button")).toBeInTheDocument();
  });

  it("does not offer editing a main-branch transform on a read-only instance", () => {
    setup({ transform: MAIN_TRANSFORM, remoteSyncType: "read-only" });

    expect(
      screen.queryByTestId("edit-definition-button"),
    ).not.toBeInTheDocument();
  });
});
