import { useState, useCallback } from "react";
import { t } from "ttag";

import { Modal } from "metabase/ui";
import ErrorBoundary from "metabase/ErrorBoundary";
import type { SearchResult } from "metabase-types/api";

import { tabOptions, type ValidTab } from "../../utils";
import { TabsView, ButtonBar, SinglePickerView } from "../../components";
import { EntityPickerSearchInput } from "../../EntityPickerSearch";
import { GrowFlex, ModalContent, ModalBody } from "./EntityPickerModal.styled";

type EntityPickerModalOptions = {
  showPersonalCollection?: boolean;
  showSearch?: boolean;
  showRecents?: boolean;
  hasConfirmButtons?: boolean;
};

const defaultOptions: EntityPickerModalOptions = {
  showPersonalCollection: true,
  showSearch: true,
  showRecents: true,
  hasConfirmButtons: true,
};

interface EntityPickerModalProps {
  title: string;
  value?: any;
  onChange: (item: any) => void;
  onClose: () => void;
  tabs: ValidTab[];
  options?: EntityPickerModalOptions;
}

export function EntityPickerModal({
  title = t`Choose an item`,
  onChange,
  onClose,
  tabs,
  value,
  options = defaultOptions,
}: EntityPickerModalProps) {
  const validTabs = tabs.filter(tabName => tabName in tabOptions);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(
    null,
  );

  const handleItemSelect = useCallback(
    (item: any) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else {
        onChange(item);
      }
    },
    [onChange, options],
  );

  const handleConfirm = () => {
    onChange(selectedItem);
  };

  const hasTabs = validTabs.length > 1 || searchQuery;

  return (
    <Modal.Root opened onClose={onClose}>
      <Modal.Overlay />
      <ModalContent h="100%">
        <Modal.Header px="2rem" pt="1rem" pb={hasTabs ? "1rem" : "1.5rem"}>
          <GrowFlex justify="space-between">
            <Modal.Title lh="2.5rem">{title}</Modal.Title>
            {options.showSearch && (
              <EntityPickerSearchInput
                models={validTabs}
                setSearchResults={setSearchResults}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            )}
          </GrowFlex>
          <Modal.CloseButton />
        </Modal.Header>
        <ModalBody p="0">
          <ErrorBoundary>
            {hasTabs ? (
              <TabsView
                tabs={validTabs}
                onItemSelect={handleItemSelect}
                value={value}
                searchQuery={searchQuery}
                searchResults={searchResults}
                options={options}
                selectedItem={selectedItem}
              />
            ) : (
              <SinglePickerView
                model={tabs[0]}
                onItemSelect={handleItemSelect}
                value={value}
                options={options}
              />
            )}
            {!!options.hasConfirmButtons && (
              <ButtonBar
                onConfirm={handleConfirm}
                onCancel={onClose}
                canConfirm={!!selectedItem}
              />
            )}
          </ErrorBoundary>
        </ModalBody>
      </ModalContent>
    </Modal.Root>
  );
}
