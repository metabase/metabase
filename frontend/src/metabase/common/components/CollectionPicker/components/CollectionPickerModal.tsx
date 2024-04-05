import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { SearchModelType } from "metabase-types/api";

import type { EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import type { CollectionPickerItem, CollectionPickerOptions } from "../types";

import { CollectionPicker } from "./CollectionPicker";
import { NewCollectionDialog } from "./NewCollectionDialog";

interface CollectionPickerModalProps {
  title?: string;
  onChange: (item: CollectionPickerItem) => void;
  onClose: () => void;
  options?: CollectionPickerOptions;
  value: Pick<CollectionPickerItem, "id" | "model">;
  shouldDisableItem?: (item: CollectionPickerItem) => boolean;
}

const canSelectItem = (item: CollectionPickerItem | null): boolean => {
  return !!item && item?.can_write !== false;
};

const searchFilter = (
  searchResults: CollectionPickerItem[],
): CollectionPickerItem[] => {
  return searchResults.filter(result => result.can_write);
};

export const CollectionPickerModal = ({
  title = t`Choose a collection`,
  onChange,
  onClose,
  value,
  options = defaultOptions,
  shouldDisableItem,
}: CollectionPickerModalProps) => {
  options = { ...defaultOptions, ...options };
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

  const handleItemSelect = useCallback(
    async (item: CollectionPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else {
        await onChange(item);
      }
    },
    [onChange, options],
  );

  const handleConfirm = async () => {
    if (selectedItem) {
      await onChange(selectedItem);
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

  const tabs: [EntityTab<SearchModelType>] = [
    {
      displayName: t`Collections`,
      model: "collection",
      icon: "folder",
      element: (
        <CollectionPicker
          onItemSelect={handleItemSelect}
          shouldDisableItem={shouldDisableItem}
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
