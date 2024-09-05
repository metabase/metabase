import { useWindowEvent } from "@mantine/hooks";
import { useMemo, useState } from "react";
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
  TypeWithModel,
} from "../../types";
import { EntityPickerSearchInput } from "../EntityPickerSearch/EntityPickerSearch";
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

export interface EntityPickerModalProps<Model extends string, Item> {
  title?: string;
  selectedItem: Item | null;
  initialValue?: Partial<Item>;
  onConfirm?: () => void;
  onItemSelect: (item: Item) => void;
  canSelectItem: boolean;
  onClose: () => void;
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
}

export function EntityPickerModal<
  Id extends SearchResultId,
  Model extends SearchModel,
  Item extends TypeWithModel<Id, Model>,
>({
  title = t`Choose an item`,
  onItemSelect,
  canSelectItem,
  onConfirm,
  selectedItem,
  initialValue,
  onClose,
  tabs: passedTabs,
  options,
  actionButtons = [],
  searchResultFilter,
  recentFilter,
  trapFocus = true,
  searchParams,
  defaultToRecentTab = true,
  recentsContext = ["selections", "views"],
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

  const [showActionButtons, setShowActionButtons] = useState<boolean>(
    !!actionButtons.length,
  );

  const hydratedOptions = useMemo(
    () => ({ ...defaultOptions, ...options }),
    [options],
  );

  assertValidProps(hydratedOptions, onConfirm);

  const { open } = useModalOpen();

  const tabModels = useMemo(
    () =>
      passedTabs
        .flatMap(t => (t.additionalModels || []).concat(t.model))
        .filter(Boolean),
    [passedTabs],
  );

  const filteredRecents = useMemo(() => {
    const relevantModelRecents =
      recentItems?.filter(recentItem =>
        tabModels.includes(recentItem.model as Model),
      ) || [];

    return recentFilter
      ? recentFilter(relevantModelRecents)
      : relevantModelRecents;
  }, [recentItems, tabModels, recentFilter]);

  const tabs: EntityTab<Model | "recents">[] = useMemo(
    () =>
      hydratedOptions.hasRecents && filteredRecents.length > 0
        ? [
            {
              model: "recents",
              displayName: t`Recents`,
              icon: "clock",
              element: (
                <RecentsTab
                  isLoading={isLoadingRecentItems}
                  recentItems={filteredRecents}
                  onItemSelect={onItemSelect}
                  selectedItem={selectedItem}
                />
              ),
            },
            ...passedTabs,
          ]
        : passedTabs,
    [
      selectedItem,
      onItemSelect,
      passedTabs,
      isLoadingRecentItems,
      hydratedOptions.hasRecents,
      filteredRecents,
    ],
  );

  const hasTabs = tabs.length > 1 || searchQuery;

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
                tabs={tabs}
                onItemSelect={onItemSelect}
                searchQuery={searchQuery}
                searchResults={searchResults}
                selectedItem={selectedItem}
                initialValue={initialValue}
                defaultToRecentTab={defaultToRecentTab}
                setShowActionButtons={setShowActionButtons}
              />
            ) : (
              <SinglePickerView data-testid="single-picker-view">
                {tabs?.[0]?.element}
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
