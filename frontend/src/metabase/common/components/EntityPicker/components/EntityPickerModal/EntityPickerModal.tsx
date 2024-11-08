import { useWindowEvent } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebounce, usePreviousDistinct } from "react-use";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { useModalOpen } from "metabase/hooks/use-modal-open";
import { Box, Flex, Icon, Modal, Skeleton, TextInput } from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import type {
  RecentContexts,
  RecentItem,
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
import {
  GrowFlex,
  ModalBody,
  ModalContent,
  SinglePickerView,
} from "./EntityPickerModal.styled";
import { TabsView } from "./TabsView";

export type EntityPickerModalOptions = {
  showSearch?: boolean;
  hasConfirmButtons?: boolean;
  confirmButtonText?: string;
  cancelButtonText?: string;
  hasRecents?: boolean;
};

export const defaultOptions: EntityPickerModalOptions = {
  showSearch: true,
  hasConfirmButtons: true,
  hasRecents: true,
};

export const DEFAULT_RECENTS_CONTEXT: RecentContexts[] = [
  "selections",
  "views",
];

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
  recentFilter,
  trapFocus = true,
  searchParams,
  defaultToRecentTab = true,
  recentsContext = DEFAULT_RECENTS_CONTEXT,
  onClose,
  onConfirm,
  onItemSelect,
  isLoadingTabs = false,
}: EntityPickerModalProps<Id, Model, Item>) {
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
  const searchModels = useMemo(() => getSearchModels(passedTabs), [passedTabs]);
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

  const { data, isFetching } = useSearchQuery(
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

    const relevantModelRecents = recentItems.filter(recentItem => {
      return searchModels.includes(recentItem.model);
    });

    return recentFilter
      ? recentFilter(relevantModelRecents)
      : relevantModelRecents;
  }, [recentItems, searchModels, recentFilter]);

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
        model: null,
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
        model: null,
        folderModels: [],
        displayName: getSearchTabText(finalSearchResults, searchQuery),
        icon: "search",
        render: ({ onItemSelect }) => (
          <SearchTab
            folder={selectedFolder}
            isLoading={isFetching}
            searchScope={searchScope}
            searchResults={finalSearchResults ?? []}
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
          setTabFolderState(state => ({ ...state, [tabId]: item }));
          setSearchScope("folder");
        } else {
          setTabFolderState(state => ({ ...state, [tabId]: undefined }));
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
    event => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    { capture: true, once: true },
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
      trapFocus={trapFocus}
      closeOnEscape={false} // we're doing this manually in useWindowEvent
      xOffset="10vw"
      yOffset="10dvh"
    >
      <Modal.Overlay />
      <ModalContent h="100%">
        <Modal.Header
          px="1.5rem"
          pt="1rem"
          pb={hasTabs ? "1rem" : "1.5rem"}
          bg="var(--mb-color-background)"
        >
          <GrowFlex justify="space-between">
            <Modal.Title lh="2.5rem">{title}</Modal.Title>
            {hydratedOptions.showSearch && (
              <TextInput
                type="search"
                icon={<Icon name="search" size={16} />}
                miw={400}
                mr="2rem"
                placeholder={getSearchInputPlaceholder(selectedFolder)}
                value={searchQuery}
                onChange={e => handleQueryChange(e.target.value ?? "")}
              />
            )}
          </GrowFlex>
          <Modal.CloseButton size={21} pos="relative" top="1px" />
        </Modal.Header>
        <ModalBody p="0">
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
                <SinglePickerView data-testid="single-picker-view">
                  {tabs[0]?.render({
                    onItemSelect: item => handleSelectItem(item, tabs[0].id),
                  }) ?? null}
                </SinglePickerView>
              )}
              {!!hydratedOptions.hasConfirmButtons && onConfirm && (
                <ButtonBar
                  onConfirm={onConfirm}
                  onCancel={onClose}
                  canConfirm={canSelectItem}
                  actionButtons={showActionButtons ? actionButtons : []}
                  confirmButtonText={options?.confirmButtonText}
                  cancelButtonText={options?.cancelButtonText}
                />
              )}
            </ErrorBoundary>
          ) : (
            <EntityPickerLoadingSkeleton />
          )}
        </ModalBody>
      </ModalContent>
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
  <Box data-testid="loading-indicator">
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
