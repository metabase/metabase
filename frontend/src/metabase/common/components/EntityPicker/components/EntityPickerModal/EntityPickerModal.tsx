import { useState, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useModalOpen } from "metabase/hooks/use-modal-open";
import { Modal } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import type {
  EntityPickerOptions,
  EntityTab,
  TypeWithModel,
} from "../../types";
import { EntityPickerSearchInput } from "../EntityPickerSearch/EntityPickerSearch";

import { ButtonBar } from "./ButtonBar";
import {
  GrowFlex,
  ModalContent,
  ModalBody,
  SinglePickerView,
} from "./EntityPickerModal.styled";
import { TabsView } from "./TabsView";

export type EntityPickerModalOptions = {
  showPersonalCollection?: boolean;
  showRootCollection?: boolean;
  showSearch?: boolean;
  hasConfirmButtons?: boolean;
  allowCreateNew?: boolean;
};

export const defaultOptions: EntityPickerModalOptions = {
  showPersonalCollection: true,
  showRootCollection: true,
  showSearch: true,
  hasConfirmButtons: true,
  allowCreateNew: true,
};

export interface EntityPickerModalProps<TItem> {
  title?: string;
  selectedItem: TItem | null;
  onConfirm: () => void;
  onItemSelect: (item: TItem) => void;
  canSelectItem: boolean;
  onClose: () => void;
  tabs: [EntityTab, ...EntityTab[]]; // Enforces that the array is not empty
  options?: Partial<EntityPickerOptions>;
  searchResultFilter?: (results: SearchResult[]) => SearchResult[];
  actionButtons?: JSX.Element[];
  trapFocus?: boolean;
}

export function EntityPickerModal<TItem extends TypeWithModel>({
  title = t`Choose an item`,
  onItemSelect,
  canSelectItem,
  onConfirm,
  selectedItem,
  onClose,
  tabs,
  options,
  actionButtons = [],
  searchResultFilter,
  trapFocus = true,
}: EntityPickerModalProps<TItem>) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(
    null,
  );

  const hydratedOptions = useMemo(
    () => ({
      ...defaultOptions,
      ...options,
    }),
    [options],
  );

  const { open } = useModalOpen();

  const hasTabs = tabs.length > 1 || searchQuery;
  const tabModels = useMemo(() => tabs.map(t => t.model), [tabs]);

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      data-testid="entity-picker-modal"
      trapFocus={trapFocus}
    >
      <Modal.Overlay />
      <ModalContent h="100%">
        <Modal.Header px="1.5rem" pt="1rem" pb={hasTabs ? "1rem" : "1.5rem"}>
          <GrowFlex justify="space-between">
            <Modal.Title lh="2.5rem">{title}</Modal.Title>
            {hydratedOptions.showSearch && (
              <EntityPickerSearchInput
                models={tabModels}
                setSearchResults={setSearchResults}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchFilter={searchResultFilter}
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
              />
            ) : (
              <SinglePickerView>{tabs[0].element}</SinglePickerView>
            )}
            {!!hydratedOptions.hasConfirmButtons && (
              <ButtonBar
                onConfirm={onConfirm}
                onCancel={onClose}
                canConfirm={canSelectItem}
                actionButtons={actionButtons}
              />
            )}
          </ErrorBoundary>
        </ModalBody>
      </ModalContent>
    </Modal.Root>
  );
}
