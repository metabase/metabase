import { useWindowEvent } from "@mantine/hooks";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDebounce, usePreviousDistinct } from "react-use";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { useModalOpen } from "metabase/common/hooks/use-modal-open";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import resizeObserver from "metabase/lib/resize-observer";
import {
  Box,
  Flex,
  Icon,
  Modal,
  Repeat,
  Skeleton,
  TextInput,
} from "metabase/ui";
import type {
  RecentContexts,
  RecentItem,
  SearchModel,
  SearchRequest,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import { RECENTS_TAB_ID, SEARCH_TAB_ID } from "../../constants";
import { useScopedSearchResults } from "../../hooks";
import type {
  EntityPickerOptions,
  EntityPickerSearchScope,
  EntityPickerTab,
  EntityPickerTabId,
  TabFolderState,
  TypeWithModel,
} from "../../types";
import {
  computeInitialTabId,
  getSearchFolderModels,
  getSearchInputPlaceholder,
  getSearchModels,
  getSearchTabText,
  isSearchFolder,
} from "../../utils";
import { RecentsTab } from "../RecentsTab";
import { SearchTab } from "../SearchTab";

import { ButtonBar } from "./ButtonBar";
import S from "./EntitityPickerModal.module.css";
import { TabsView } from "./TabsView";

export type EntityPickerModalOptions = {
  showSearch?: boolean;
  hasConfirmButtons?: boolean;
  confirmButtonText?: string | ((model?: string) => string);
  cancelButtonText?: string;
  hasRecents?: boolean;
  showDatabases?: boolean;
  showLibrary?: boolean;
};

export const defaultOptions: EntityPickerModalOptions = {
  showSearch: true,
  hasConfirmButtons: true,
  hasRecents: true,
  showLibrary: true,
};

export const DEFAULT_RECENTS_CONTEXT: RecentContexts[] = [
  "selections",
  "views",
];

const DEFAULT_RECENTS_FILTER = (item: RecentItem[]) => item;

const DEFAULT_SEARCH_RESULT_FILTER = (results: SearchResult[]) => results;

export interface EntityPickerModalProps<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  title?: string;
  selectedItem: Item | null;
  initialValue?: Partial<Item>;
  canSelectItem: boolean;
  tabs: EntityPickerTab<Id, Model, Item>[];
  options?: Partial<EntityPickerOptions>;
  searchResultFilter?: (results: SearchResult[]) => SearchResult[];
  recentFilter?: (results: RecentItem[]) => RecentItem[];
  searchParams?: Partial<SearchRequest>;
  actionButtons?: JSX.Element[];
  trapFocus?: boolean;
  /**defaultToRecentTab: If set to true, will initially show the recent tab when the modal appears. If set to false, it will show the tab
   * with the same model as the initialValue. Defaults to true. */
  defaultToRecentTab?: boolean;
  /**recentsContext: Defaults to returning recents based off both views and selections. Can be overridden by props */
  recentsContext?: RecentContexts[];
  onClose: () => void;
  onConfirm?: () => void;
  onItemSelect: (item: Item) => void;
  isLoadingTabs?: boolean;
  searchExtraButtons?: ReactNode[];
  children?: ReactNode;
  disableCloseOnEscape?: boolean;
  searchModels?: (SearchModel | "table")[];
}

export function EntityPickerModal<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  title = t`Choose an item`,
  canSelectItem,
  selectedItem,
  initialValue,
  tabs: passedTabs,
  options,
  actionButtons = [],
  searchResultFilter = DEFAULT_SEARCH_RESULT_FILTER,
  recentFilter = DEFAULT_RECENTS_FILTER,
  trapFocus = true,
  searchParams,
  defaultToRecentTab = true,
  recentsContext = DEFAULT_RECENTS_CONTEXT,
  onClose,
  onConfirm,
  onItemSelect,
  isLoadingTabs = false,
  disableCloseOnEscape = false,
  children,
  searchModels: _searchModels,
}: EntityPickerModalProps<Id, Model, Item>) {
  const [modalContentMinWidth, setModalContentMinWidth] = useState(920);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchScope, setSearchScope] =
    useState<EntityPickerSearchScope>("everywhere");
  const { data: recentItems, isLoading: isLoadingRecentItems } =
    useListRecentsQuery(
      { context: recentsContext },
      {
        refetchOnMountOrArgChange: true,
      },
    );
  const searchModels = useMemo(
    () => _searchModels || getSearchModels(passedTabs),
    [passedTabs, _searchModels],
  );

  const folderModels = useMemo(
    () => getSearchFolderModels(passedTabs),
    [passedTabs],
  );
  const [selectedTabId, setSelectedTabId] = useState<EntityPickerTabId>("");
  const previousTabId = usePreviousDistinct(selectedTabId);
  const [tabFolderState, setTabFolderState] = useState<
    TabFolderState<Id, Model, Item>
  >({});
  const selectedFolder =
    tabFolderState[
      selectedTabId === SEARCH_TAB_ID
        ? (previousTabId ?? selectedTabId)
        : selectedTabId
    ];
  const scopedSearchResults = useScopedSearchResults(
    searchQuery,
    searchModels,
    searchScope,
    selectedFolder,
  );
  const hydratedOptions = useMemo(
    () => ({ ...defaultOptions, ...options }),
    [options],
  );

  assertValidProps(hydratedOptions, onConfirm);

  const { open } = useModalOpen();

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useDebounce(() => setDebouncedSearchQuery(searchQuery), 200, [searchQuery]);

  const { data, isFetching, requestId } = useSearchQuery(
    {
      q: debouncedSearchQuery,
      models: searchModels,
      context: "entity-picker",
      ...searchParams,
    },
    {
      skip: !debouncedSearchQuery || searchScope === "folder",
    },
  );

  const finalSearchResults = useMemo(() => {
    if (searchScope === "folder") {
      if (!scopedSearchResults) {
        return null;
      }
      return searchResultFilter(scopedSearchResults as SearchResult[]);
    } else {
      if (isFetching || !data) {
        return null;
      }
      return searchResultFilter(data.data);
    }
  }, [searchScope, scopedSearchResults, isFetching, data, searchResultFilter]);

  const filteredRecents = useMemo(() => {
    if (!recentItems) {
      return [];
    }

    const relevantModelRecents = recentItems.filter((recentItem) => {
      return searchModels.includes(recentItem.model);
    });

    return recentFilter(relevantModelRecents);
  }, [recentItems, recentFilter, searchModels]);

  const tabs: EntityPickerTab<Id, Model, Item>[] = (function getTabs() {
    const computedTabs: EntityPickerTab<Id, Model, Item>[] = [];
    const hasRecentsTab =
      hydratedOptions.hasRecents && filteredRecents.length > 0;
    const hasSearchTab = !!searchQuery;
    // This is to prevent different tab being initially open and then flickering back
    // to recents tab once recents have loaded (due to computeInitialTab)
    const shouldOptimisticallyAddRecentsTabWhileLoading =
      defaultToRecentTab && isLoadingRecentItems;

    if (hasRecentsTab || shouldOptimisticallyAddRecentsTabWhileLoading) {
      computedTabs.push({
        id: RECENTS_TAB_ID,
        models: [],
        folderModels: [],
        displayName: t`Recents`,
        icon: "clock",
        render: ({ onItemSelect }) => (
          <RecentsTab
            isLoading={isLoadingRecentItems}
            recentItems={filteredRecents}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
          />
        ),
      });
    }

    computedTabs.push(...passedTabs);

    if (hasSearchTab) {
      computedTabs.push({
        id: SEARCH_TAB_ID,
        models: [],
        folderModels: [],
        displayName: getSearchTabText(finalSearchResults, searchQuery),
        icon: "search",
        render: ({ onItemSelect }) => (
          <SearchTab
            folder={selectedFolder}
            isLoading={isFetching}
            searchScope={searchScope}
            searchResults={finalSearchResults ?? []}
            searchEngine={data?.engine}
            searchRequestId={requestId}
            searchTerm={searchQuery}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
            onSearchScopeChange={setSearchScope}
          />
        ),
      });
    }

    return computedTabs;
  })();

  const hasTabs = tabs.length > 1;
  const initialTabId = useMemo(
    () => computeInitialTabId({ initialValue, tabs, defaultToRecentTab }),
    [initialValue, tabs, defaultToRecentTab],
  );
  // we don't want to show bonus actions on recents or search tabs
  const showActionButtons = ![SEARCH_TAB_ID, RECENTS_TAB_ID].includes(
    selectedTabId,
  );

  const handleSelectItem = useCallback(
    (item: Item, tabId: EntityPickerTabId) => {
      if (tabId !== SEARCH_TAB_ID && tabId !== RECENTS_TAB_ID) {
        if (isSearchFolder(item, folderModels)) {
          setTabFolderState((state) => ({ ...state, [tabId]: item }));
          setSearchScope("folder");
        } else {
          setTabFolderState((state) => ({ ...state, [tabId]: undefined }));
          setSearchScope("everywhere");
        }
      }

      onItemSelect(item);
    },
    [folderModels, onItemSelect],
  );

  const handleTabChange = useCallback(
    (tabId: EntityPickerTabId) => {
      setSelectedTabId(tabId);
      if (tabId !== SEARCH_TAB_ID) {
        setSearchScope(tabFolderState[tabId] ? "folder" : "everywhere");
      }
    },
    [tabFolderState],
  );

  const handleQueryChange = useCallback(
    (newSearchQuery: string) => {
      setSearchQuery(newSearchQuery);

      // automatically switch to search tab
      if (newSearchQuery) {
        handleTabChange(SEARCH_TAB_ID);

        if (!searchQuery) {
          setSearchScope(selectedFolder ? "folder" : "everywhere");
        }
      }

      // restore previous tab when clearing search while on search tab
      if (searchQuery && !newSearchQuery && selectedTabId === SEARCH_TAB_ID) {
        handleTabChange(previousTabId ?? initialTabId);
      }
    },
    [
      selectedFolder,
      searchQuery,
      selectedTabId,
      previousTabId,
      initialTabId,
      handleTabChange,
    ],
  );

  useEffect(() => {
    setSelectedTabId(initialTabId);
  }, [initialTabId]);

  useWindowEvent(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        !disableCloseOnEscape && onClose();
      }
    },
    { capture: true },
  );

  const titleId = useUniqueId("entity-picker-modal-title-");

  const modalContentResizeHandler = useCallback(
    (entry: ResizeObserverEntry) => {
      const width = entry.contentRect.width;
      setModalContentMinWidth((currentWidth) =>
        currentWidth < width ? width : currentWidth,
      );
    },
    [],
  );

  const modalContentCallbackRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        resizeObserver.subscribe(element, modalContentResizeHandler);
        modalContentRef.current = element;
      } else {
        if (modalContentRef.current) {
          resizeObserver.unsubscribe(
            modalContentRef.current,
            modalContentResizeHandler,
          );
        }
      }
    },
    [modalContentResizeHandler],
  );

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      data-testid="entity-picker-modal"
      /**
       * Both children of this component have "position: fixed" so the element's height is 0 by default.
       * This makes the following assertion to fail in Cypress:
       *   cy.findByTestId("entity-picker-modal").should("be.visible");
       * Height is specified here to make that assertion pass.
       */
      h="100vh"
      w="100vw"
      trapFocus={trapFocus}
      closeOnEscape={false} // we're doing this manually in useWindowEvent
      yOffset="10dvh"
    >
      <Modal.Overlay />
      <Modal.Content
        className={S.modalContent}
        aria-labelledby={titleId}
        miw={`min(${modalContentMinWidth}px, 80vw)`}
        w="fit-content"
        maw="80vw"
        ref={modalContentCallbackRef}
      >
        <Modal.Header
          px="2.5rem"
          pt="1rem"
          pb={hasTabs ? "1rem" : "1.5rem"}
          bg="background-primary"
        >
          <Modal.Title id={titleId} lh="2.5rem">
            {title}
          </Modal.Title>
          <Modal.CloseButton size={21} pos="relative" top="1px" />
        </Modal.Header>
        <Modal.Body className={S.modalBody} p="0">
          {hydratedOptions.showSearch && (
            <Box px="2.5rem" mb="1.5rem">
              <TextInput
                classNames={{ input: S.textInput }}
                data-autofocus
                type="search"
                leftSection={<Icon name="search" size={16} />}
                miw={400}
                placeholder={getSearchInputPlaceholder(selectedFolder)}
                value={searchQuery}
                onChange={(e) => handleQueryChange(e.target.value ?? "")}
              />
            </Box>
          )}
          {!isLoadingTabs && !isLoadingRecentItems ? (
            <ErrorBoundary>
              {hasTabs ? (
                <TabsView
                  selectedTabId={selectedTabId}
                  tabs={tabs}
                  onItemSelect={handleSelectItem}
                  onTabChange={handleTabChange}
                />
              ) : (
                <div
                  className={S.singlePickerView}
                  data-testid="single-picker-view"
                >
                  {tabs[0]?.render({
                    onItemSelect: (item) => handleSelectItem(item, tabs[0].id),
                  }) ?? null}
                </div>
              )}
              {!!hydratedOptions.hasConfirmButtons && onConfirm && (
                <ButtonBar
                  onConfirm={onConfirm}
                  onCancel={onClose}
                  canConfirm={canSelectItem}
                  actionButtons={showActionButtons ? actionButtons : []}
                  confirmButtonText={
                    typeof options?.confirmButtonText === "function"
                      ? options.confirmButtonText(selectedItem?.model)
                      : options?.confirmButtonText
                  }
                  cancelButtonText={options?.cancelButtonText}
                />
              )}
            </ErrorBoundary>
          ) : (
            <EntityPickerLoadingSkeleton />
          )}
          {children}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

const assertValidProps = (
  options: EntityPickerModalOptions,
  onConfirm: (() => void) | undefined,
) => {
  if (options.hasConfirmButtons && !onConfirm) {
    throw new Error(
      "onConfirm prop is required when hasConfirmButtons is true",
    );
  }
};

const EntityPickerLoadingSkeleton = () => (
  <Box data-testid="loading-indicator" className={S.loadingSkeleton}>
    <Flex px="2rem" gap="1.5rem" mb="3.5rem">
      <Repeat times={3}>
        <Skeleton h="2rem" w="5rem" mb="0.5rem" />
      </Repeat>
    </Flex>
    <Flex px="2rem" mb="2.5rem" direction="column">
      <Repeat times={2}>
        <Skeleton h="3rem" mb="0.5rem" />
      </Repeat>
    </Flex>
    <Flex px="2rem" direction="column">
      <Repeat times={3}>
        <Skeleton h="3rem" mb="0.5rem" />
      </Repeat>
    </Flex>
  </Box>
);
