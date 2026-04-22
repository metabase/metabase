import type { ReactNode } from "react";
import { Route } from "react-router";

import {
  setupCollectionTreeEndpoint,
  setupDatabaseListEndpoint,
  setupListTransformsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { TransformListPage } from "./TransformListPage";

type MockInstance = {
  table: {
    getRowModel: () => { rows: Array<{ original: { name: string } }> };
  };
};

jest.mock("metabase/ui/components/data-display/TreeTable/TreeTable", () => ({
  TreeTable: ({
    instance,
    emptyState,
  }: {
    instance: MockInstance;
    emptyState: ReactNode;
  }) => {
    const rows = instance.table.getRowModel().rows;
    if (rows.length === 0) {
      return <div data-testid="tree-table-mock">{emptyState}</div>;
    }
    return (
      <div data-testid="tree-table-mock">
        {rows.map((row, i) => (
          <div key={i} data-testid="tree-node-name">
            {row.original.name}
          </div>
        ))}
      </div>
    );
  },
}));

type SetupOpts = {
  tokenFeatures?: Partial<TokenFeatures>;
};

async function setup({ tokenFeatures = {} }: SetupOpts = {}) {
  setupCollectionTreeEndpoint([]);
  setupListTransformsEndpoint([]);
  setupDatabaseListEndpoint([]);

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  const path = "/transforms";
  renderWithProviders(<Route path={path} component={TransformListPage} />, {
    storeInitialState: state,
    withRouter: true,
    initialRoute: path,
  });

  await waitForLoaderToBeRemoved();
}

describe("TransformListPage", () => {
  describe("Python library row visibility", () => {
    it("does not show the Python library row on OSS", async () => {
      await setup({ tokenFeatures: {} });

      expect(screen.queryByText("Python library")).not.toBeInTheDocument();
    });

    it("shows the Python library row when the transforms-python feature is enabled", async () => {
      await setup({ tokenFeatures: { "transforms-python": true } });

      expect(screen.getByText("Python library")).toBeInTheDocument();
    });

    it("shows the Python library row on a paid plan without the transforms-python feature (upsell)", async () => {
      await setup({ tokenFeatures: { advanced_permissions: true } });

      expect(screen.getByText("Python library")).toBeInTheDocument();
    });
  });
});
