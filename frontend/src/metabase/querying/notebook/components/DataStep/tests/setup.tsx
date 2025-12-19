import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";
import { createMockCollection } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../../test-utils";
import type { NotebookStep } from "../../../types";
import { NotebookProvider } from "../../Notebook/context";
import { DataStep } from "../DataStep";

export interface SetupOpts {
  step?: NotebookStep;
  readOnly?: boolean;
  isEmbeddingSdk?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}
export const setup = ({
  step = createMockNotebookStep(),
  readOnly = false,
  isEmbeddingSdk = false,
  enterprisePlugins,
}: SetupOpts = {}) => {
  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }
  const mockWindowOpen = jest.spyOn(window, "open").mockImplementation();

  const updateQuery = jest.fn();
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);

  // In embedding SDK we call a different endpoint because we use a different data picker (metabase#52889)
  if (isEmbeddingSdk) {
    setupSearchEndpoints([
      createMockModelResult({
        id: 0,
        name: "Products",
      }),
    ]);
  } else {
    setupSearchEndpoints([]);
  }

  renderWithProviders(
    <NotebookProvider>
      <DataStep
        step={step}
        query={step.query}
        stageIndex={step.stageIndex}
        readOnly={readOnly}
        color="brand"
        isLastOpened={false}
        reportTimezone="UTC"
        updateQuery={updateQuery}
      />
    </NotebookProvider>,
  );

  const getNextQuery = (): Lib.Query => {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  };

  const getNextTableName = () => {
    const query = getNextQuery();
    const [sampleColumn] = Lib.visibleColumns(query, 0);
    return Lib.displayInfo(query, 0, sampleColumn).table?.displayName;
  };

  const getNextColumn = (columnName: string) => {
    const nextQuery = getNextQuery();
    const nextFields = Lib.fieldableColumns(nextQuery, 0);
    const findColumn = columnFinder(nextQuery, nextFields);
    const column = findColumn("ORDERS", columnName);
    return Lib.displayInfo(nextQuery, 0, column);
  };

  return { getNextQuery, getNextTableName, getNextColumn, mockWindowOpen };
};
