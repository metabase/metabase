import { useCallback, useState, useRef } from "react";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";

import type { QuestionPickerItem, EntityTab } from "../../types";
import { NewCollectionDialog } from "../CollectionPicker/NewCollectionDialog";
import { EntityPickerModal, defaultOptions } from "../EntityPickerModal";

import {
  QuestionPicker,
  type QuestionPickerOptions,
} from "./QuestionPicker";

interface QuestionPickerModalProps {
  title?: string;
  onChange: (item: QuestionPickerItem) => void;
  onClose: () => void;
  options?: QuestionPickerOptions;
  value: Pick<QuestionPickerItem, "id" | "model">;
}

const canSelectItem = (item: QuestionPickerItem | null): boolean => {
  return !!item && item?.can_write !== false;
};

export const QuestionPickerModal = ({
  title = t`Choose a question`,
  onChange,
  onClose,
  value,
  options = defaultOptions,
}: QuestionPickerModalProps) => {
  const [selectedItem, setSelectedItem] = useState<QuestionPickerItem | null>(
    null,
  );

  const [
    isCreateDialogOpen,
    { turnOn: openCreateDialog, turnOff: closeCreateDialog },
  ] = useToggle(false);

  const pickerRef = useRef<{
    onFolderSelect: (item: { folder: QuestionPickerItem }) => void;
  }>();

  const handleItemSelect = useCallback(
    (item: QuestionPickerItem) => {
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
      disabled={['card', 'dataset'].includes(selectedItem?.model ?? 'collection') === false}
    >
      {t`Create a new collection`}
    </Button>,
  ];

  const tabs: [EntityTab] = [
    {
      displayName: t`Questions`,
      model: "card",
      icon: "table",
      element: (
        <QuestionPicker
          onItemSelect={handleItemSelect}
          initialValue={value}
          options={options}
          ref={pickerRef}
        />
      ),
    },
  ];

  const handleNewCollectionCreate = (folder: QuestionPickerItem) => {
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
