import { useCallback, useState, useRef } from "react";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import type { CollectionPickerItem, EntityTab } from "../../types";
import { EntityPickerModal, defaultOptions } from "../EntityPickerModal";

import {
  CollectionPicker,
  type CollectionPickerOptions,
} from "./CollectionPicker";
import { NewCollectionDialog } from "./NewCollectionDialog";

interface CollectionPickerModalProps {
  title?: string;
  onChange: (item: CollectionPickerItem) => void;
  onClose: () => void;
  options?: CollectionPickerOptions;
  value: Pick<CollectionPickerItem, "id" | "model">;
}

const canSelectItem = (item: CollectionPickerItem | null): boolean => {
  return !!item && item?.can_write !== false;
};

export const CollectionPickerModal = ({
  title = t`Choose a collection`,
  onChange,
  onClose,
  value,
  options = defaultOptions,
}: CollectionPickerModalProps) => {
  const [selectedItem, setSelectedItem] = useState<CollectionPickerItem | null>(
    null,
  );

  const [
    isCreateDialogOpen,
    { turnOn: openCreateDialog, turnOff: closeCreateDialog },
  ] = useToggle(false);

  const pickerRef = useRef<{
    onFolderSelect: (item: { folder: CollectionPickerItem }) => void;
  }>();

  const searchFilter = useCallback(
    searchResults =>
      searchResults.filter((result: SearchResult) => result.can_write),
    [],
  );

  const handleItemSelect = useCallback(
    (item: CollectionPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else {
        onChange(item);
      }
    },
    [onChange, options],
  );

  const handleConfirm = () => {
    if (selectedItem) {
      onChange(selectedItem);
    }
  };

  const modalActions = [
    <Button
      key="collection-on-the-go"
      miw="21rem"
      onClick={openCreateDialog}
      leftIcon={<Icon name="add" />}
      disabled={selectedItem?.can_write === false}
    >
      {t`Create a new collection`}
    </Button>,
  ];

  const tabs: [EntityTab] = [
    {
      displayName: t`Collections`,
      model: "collection",
      icon: "folder",
      element: (
        <CollectionPicker
          onItemSelect={handleItemSelect}
          initialValue={value}
          options={options}
          ref={pickerRef}
        />
      ),
    },
  ];

  const handleNewCollectionCreate = (folder: CollectionPickerItem) => {
    pickerRef.current?.onFolderSelect({ folder });
  };

  return (
    <>
      <EntityPickerModal
        title={title}
        onItemSelect={handleItemSelect}
        canSelectItem={!isCreateDialogOpen && canSelectItem(selectedItem)}
        onConfirm={handleConfirm}
        onClose={onClose}
        selectedItem={selectedItem}
        tabs={tabs}
        options={options}
        searchResultFilter={searchFilter}
        actionButtons={modalActions}
        trapFocus={!isCreateDialogOpen}
      />
      <NewCollectionDialog
        isOpen={isCreateDialogOpen}
        onClose={closeCreateDialog}
        parentCollectionId={selectedItem?.id || value?.id || "root"}
        onNewCollection={handleNewCollectionCreate}
      />
    </>
  );
};
