import { useWindowEvent } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useListRecentsQuery } from "metabase/api";
import { BULK_ACTIONS_Z_INDEX } from "metabase/components/BulkActionBar";
import { useModalOpen } from "metabase/hooks/use-modal-open";
import { Modal } from "metabase/ui";
import type {
  RecentContexts,
  RecentItem,
  SearchModel,
  SearchRequest,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import type {
  EntityPickerOptions,
  EntityTab,
  TabFolderState,
  TypeWithModel,
} from "../../types";
import {
  computeInitialTab,
  getSearchTabText,
  isSearchModel,
} from "../../utils";
import {
  EntityPickerSearchInput,
  EntityPickerSearchResults,
} from "../EntityPickerSearch";
import { RecentsTab } from "../RecentsTab";

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

// needs to be above popovers and bulk actions
export const ENTITY_PICKER_Z_INDEX = BULK_ACTIONS_Z_INDEX;

export const DEFAULT_RECENTS_CONTEXT: RecentContexts[] = [
  "selections",
  "views",
];

export interface EntityPickerModalProps<Model extends string, Item> {
  title?: string;
  selectedItem: Item | null;
  initialValue?: Partial<Item>;
  canSelectItem: boolean;
  tabs: EntityTab<Model>[];
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
  searchResultFilter,
  recentFilter,
  trapFocus = true,
  searchParams,
  defaultToRecentTab = true,
  recentsContext = DEFAULT_RECENTS_CONTEXT,
  onClose,
  onConfirm,
  onItemSelect,
}: EntityPickerModalProps<Model, Item>) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { data: recentItems, isLoading: isLoadingRecentItems } =
    useListRecentsQuery(
      { context: recentsContext },
      {
        refetchOnMountOrArgChange: true,
      },
    );
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(
    null,
  );

  const hydratedOptions = useMemo(
    () => ({ ...defaultOptions, ...options }),
    [options],
  );

  assertValidProps(hydratedOptions, onConfirm);

  const { open } = useModalOpen();

  const tabModels = useMemo((): SearchModel[] => {
    return passedTabs
      .map(tab => tab.model)
      .filter(model => isSearchModel(model));
  }, [passedTabs]);

  const filteredRecents = useMemo(() => {
    if (!recentItems) {
      return [];
    }

    const relevantModelRecents = recentItems.filter(recentItem => {
      return tabModels.includes(recentItem.model);
    });

    return recentFilter
      ? recentFilter(relevantModelRecents)
      : relevantModelRecents;
  }, [recentItems, tabModels, recentFilter]);

  const tabs: EntityTab<Model | "recents" | "search">[] = useMemo(() => {
    const computedTabs: EntityTab<Model | "recents" | "search">[] = [];
    const hasRecentsTab =
      hydratedOptions.hasRecents && filteredRecents.length > 0;
    const hasSearchTab = !!searchQuery;
    // This is to prevent different tab being initially open and then flickering back
    // to recents tab once recents have loaded (due to computeInitialTab)
    const shouldOptimisticallyAddRecentsTabWhileLoading =
      defaultToRecentTab && isLoadingRecentItems;

    if (hasRecentsTab || shouldOptimisticallyAddRecentsTabWhileLoading) {
      computedTabs.push({
        model: "recents",
        displayName: t`Recents`,
        icon: "clock",
        render: ({ onItemSelect }) => (
          <RecentsTab
            isLoading={isLoadingRecentItems}
            recentItems={filteredRecents}
            onItemSelect={onItemSelect}
            selectedItem={selectedItem}
          />
        ),
      });
    }

    computedTabs.push(...passedTabs);

    if (hasSearchTab) {
      computedTabs.push({
        model: "search",
        displayName: getSearchTabText(searchResults, searchQuery),
        icon: "search",
        render: ({ onItemSelect }) => (
          <EntityPickerSearchResults
            searchResults={searchResults}
            onItemSelect={onItemSelect}
            selectedItem={selectedItem}
          />
        ),
      });
    }

    return computedTabs;
  }, [
    defaultToRecentTab,
    filteredRecents,
    hydratedOptions.hasRecents,
    isLoadingRecentItems,
    passedTabs,
    searchQuery,
    searchResults,
    selectedItem,
  ]);

  const hasTabs = tabs.length > 1;
  const initialTab = useMemo(
    () => computeInitialTab({ initialValue, tabs, defaultToRecentTab }),
    [initialValue, tabs, defaultToRecentTab],
  );
  const [selectedTab, setSelectedTab] = useState<Model | "search" | "recents">(
    initialTab.model,
  );
  // we don't want to show bonus actions on recents or search tabs
  const showActionButtons = !["search", "recents"].includes(selectedTab);
  const [tabFolderState, setTabFolderState] = useState<
    TabFolderState<Model | "search" | "recents">
  >({});
  const selectedFolder = tabFolderState[selectedTab];

  console.log(
    selectedFolder
      ? [selectedFolder.model, selectedFolder.id, selectedFolder.name].join(
          " - ",
        )
      : null,
  );

  const handleSelectItem = useCallback(
    (item: TypeWithModel<string | number, string>) => {
      // TODO: if is folder
      setTabFolderState(state => ({
        ...state,
        [selectedTab]: item,
      }));
      onItemSelect(item);
    },
    [selectedTab, onItemSelect],
  );

  useEffect(() => {
    // when the searchQuery changes, switch to the search tab
    if (searchQuery) {
      setSelectedTab("search");
    } else {
      setSelectedTab(initialTab.model);
    }
  }, [searchQuery, initialTab.model]);

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
      zIndex={ENTITY_PICKER_Z_INDEX} // needs to be above popovers and bulk actions
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
              <EntityPickerSearchInput
                models={tabModels}
                setSearchResults={setSearchResults}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchFilter={searchResultFilter}
                searchParams={searchParams}
              />
            )}
          </GrowFlex>
          <Modal.CloseButton size={21} pos="relative" top="1px" />
        </Modal.Header>
        <ModalBody p="0">
          <ErrorBoundary>
            {hasTabs ? (
              <TabsView
                selectedTab={selectedTab}
                tabs={tabs}
                onItemSelect={handleSelectItem}
                onTabChange={setSelectedTab}
              />
            ) : (
              <SinglePickerView>
                {tabs[0].render({ onItemSelect: handleSelectItem })}
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
