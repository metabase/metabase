import { useWindowEvent } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useModalOpen } from "metabase/hooks/use-modal-open";
import { Modal } from "metabase/ui";
import type { SearchModel, SearchResultId } from "metabase-types/api";

import type {
  EntityPickerOptions,
  EntityTab,
  TypeWithModel,
} from "../../types";
import { EntityPickerSearchInput } from "../EntityPickerSearch/EntityPickerSearch";

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
  allowCreateNew?: boolean;
  confirmButtonText?: string;
  cancelButtonText?: string;
};

export const defaultOptions: EntityPickerModalOptions = {
  showSearch: true,
  hasConfirmButtons: true,
  allowCreateNew: true,
};

export interface EntityPickerModalProps<Model extends string, Item> {
  title?: string;
  selectedItem: Item | null;
  onConfirm: () => void;
  onItemSelect: (item: Item) => void;
  canSelectItem: boolean;
  onClose: () => void;
  tabs: [EntityTab<Model>, ...EntityTab<Model>[]]; // Enforces that the array is not empty
  options?: Partial<EntityPickerOptions>;
  searchResultFilter?: (results: Item[]) => Item[];
  actionButtons?: JSX.Element[];
  trapFocus?: boolean;
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
  onClose,
  tabs,
  options,
  actionButtons = [],
  searchResultFilter,
  trapFocus = true,
}: EntityPickerModalProps<Model, Item>) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Item[] | null>(null);

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
      trapFocus={trapFocus}
      zIndex={400} // needed to put this above the BulkActionsToast
      closeOnEscape={false} // we're doing this manually in useWindowEvent
      xOffset="10vw"
      yOffset="10dvh"
    >
      <Modal.Overlay />
      <ModalContent h="100%">
        <Modal.Header px="1.5rem" pt="1rem" pb={hasTabs ? "1rem" : "1.5rem"}>
          <GrowFlex justify="space-between">
            <Modal.Title lh="2.5rem">{title}</Modal.Title>
            {hydratedOptions.showSearch && (
              <EntityPickerSearchInput<Id, Model, Item>
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
