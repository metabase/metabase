import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";
import {
  DEFAULT_SORT_ORDER,
  type ExplorationSortOrder,
} from "metabase/explorations/sidebar-preferences";
import {
  createExploration,
  createQuery,
} from "metabase/explorations/test-utils";
import type { ExplorationSidebarTab } from "metabase/explorations/types";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ExplorationBlockNode,
  ExplorationQuery,
  ExplorationThread,
} from "metabase-types/api";

import { ExplorationSidebar } from "./ExplorationSidebar";
import {
  getExplorationSidebarModel,
  getExplorationSidebarTabsInfo,
} from "./utils";

export function getSidebarTestContext(
  exploration: ReturnType<typeof createExploration>,
  selectedSidebarTab: ExplorationSidebarTab = "all",
) {
  const path = Urls.exploration(exploration.id);
  const explorationSidebarTabsInfo = getExplorationSidebarTabsInfo(exploration);
  const getSelectedSidebarTabUrl = (tab: ExplorationSidebarTab) =>
    `${path}?tab=${tab}`;

  return {
    path,
    explorationSidebarTabsInfo,
    selectedSidebarTab,
    getSelectedSidebarTabUrl,
    getModel: (opts?: {
      showHidden?: boolean;
      sortOrder?: ExplorationSortOrder;
      explorationOverride?: ReturnType<typeof createExploration>;
    }) =>
      getExplorationSidebarModel({
        exploration: opts?.explorationOverride ?? exploration,
        selectedSidebarTab,
        tabsInfo: getExplorationSidebarTabsInfo(
          opts?.explorationOverride ?? exploration,
        ),
        showHidden: opts?.showHidden ?? false,
        sortOrder: opts?.sortOrder ?? DEFAULT_SORT_ORDER,
      }),
    getTree: () =>
      getExplorationSidebarModel({
        exploration,
        selectedSidebarTab,
        tabsInfo: explorationSidebarTabsInfo,
        showHidden: false,
        sortOrder: DEFAULT_SORT_ORDER,
      }).tree,
  };
}

type TestSelectedPageId = string | null;

interface SetupOpts {
  queries: ExplorationQuery[];
  blocks?: ExplorationBlockNode[];
  thread?: Partial<ExplorationThread>;
  selectedQueryId?: number | null;
  selectedPageId?: TestSelectedPageId;
  prompt?: string | null;
  canWrite?: boolean;
  showHidden?: boolean;
  sortOrder?: ExplorationSortOrder;
  readPageIds?: ReadonlySet<string>;
  tab?: ExplorationSidebarTab;
}

export function setup({
  queries,
  blocks,
  thread,
  selectedQueryId = null,
  selectedPageId,
  prompt = null,
  canWrite = true,
  showHidden = false,
  sortOrder = DEFAULT_SORT_ORDER,
  readPageIds = new Set<string>(),
  tab = "all",
}: SetupOpts) {
  const onPreviousPage = jest.fn();
  const onNextPage = jest.fn();
  const onPrefetchPage = jest.fn();
  const onToggleShowHidden = jest.fn();
  const onChangeSortOrder = jest.fn();

  fetchMock.get("express:/api/exploration/query/:id", {
    data: { rows: [], cols: [] },
  });
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [],
    tables: [],
    fields: [],
  });

  const exploration = createExploration({
    queries,
    blocks,
    prompt,
    thread,
  });
  exploration.can_write = canWrite;

  const allPages = (exploration.threads ?? []).flatMap((t) =>
    (t.blocks ?? []).flatMap((block) => block.pages),
  );
  const findPageForQuery = (queryId: number) =>
    allPages.find((page) => page.query_ids.includes(queryId));

  let resolvedPageId: TestSelectedPageId;
  if (selectedPageId !== undefined) {
    resolvedPageId = selectedPageId;
  } else if (selectedQueryId != null) {
    const owningPage = findPageForQuery(selectedQueryId);
    resolvedPageId = owningPage ? String(owningPage.id) : null;
  } else if (queries.length > 0) {
    const firstPage = findPageForQuery(queries[0].id);
    resolvedPageId = firstPage ? String(firstPage.id) : null;
  } else {
    resolvedPageId = null;
  }

  const getSelectedPageUrl = (pageId: string) =>
    `${Urls.exploration(exploration.id)}/page/${encodeURIComponent(pageId)}`;
  const getSelectedSummaryUrl = () => Urls.explorationSummary(exploration.id);

  const explorationPath = Urls.exploration(exploration.id);
  const {
    explorationSidebarTabsInfo,
    selectedSidebarTab,
    getSelectedSidebarTabUrl,
    getModel,
  } = getSidebarTestContext(exploration, tab);

  const { tree: displayTree, contentMode } = getModel({
    showHidden,
    sortOrder,
  });

  const sidebar = (
    <ExplorationSidebar
      exploration={exploration}
      explorationSidebarTabsInfo={explorationSidebarTabsInfo}
      selectedSidebarTab={selectedSidebarTab}
      getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
      tree={displayTree}
      selectedEntity={
        resolvedPageId != null ? { type: "page", id: resolvedPageId } : null
      }
      getSelectedPageUrl={getSelectedPageUrl}
      getSelectedSummaryUrl={getSelectedSummaryUrl}
      shouldScrollSelectionRef={{ current: true }}
      isOpen
      readPageIds={readPageIds}
      showHidden={showHidden}
      onToggleShowHidden={onToggleShowHidden}
      sortOrder={sortOrder}
      onChangeSortOrder={onChangeSortOrder}
      contentMode={contentMode}
      onPreviousPage={onPreviousPage}
      onNextPage={onNextPage}
      onPrefetchPage={onPrefetchPage}
    />
  );

  renderWithProviders(<Route path={explorationPath} element={sidebar} />, {
    withRouter: true,
    initialRoute: explorationPath,
  });
  return {
    onPreviousPage,
    onNextPage,
    onPrefetchPage,
    onToggleShowHidden,
    onChangeSortOrder,
    getSelectedPageUrl,
    getSelectedSummaryUrl,
    exploration,
  };
}

export const pendingQuery = createQuery({
  id: 1,
  name: "Revenue by plan",
  status: "pending",
});
export const doneQuery = createQuery({
  id: 2,
  name: "Revenue by region",
  status: "done",
});
export const errorQuery = createQuery({
  id: 3,
  name: "Revenue by source",
  status: "error",
  error_message: "Database timed out",
});

export function getRow(name: string): HTMLElement {
  // Unjustified type cast. FIXME
  return screen
    .getAllByRole("treeitem")
    .find((el) =>
      within(el).queryByText(name, { exact: false }),
    ) as HTMLElement;
}
