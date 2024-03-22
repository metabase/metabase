import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { SearchModelType } from "metabase-types/api";

import { NewCollectionDialog } from "../../CollectionPicker/components/NewCollectionDialog";
import type { EntityTab } from "../../EntityPicker";
import {
  EntityPickerModal,
  defaultOptions as defaultEntityPickerOptions,
} from "../../EntityPicker";
import type { QuestionPickerItem, QuestionPickerOptions } from "../types";

import {
  QuestionPicker,
  defaultOptions as defaultQuestionPickerOptions,
} from "./QuestionPicker";

interface QuestionPickerModalProps {
  title?: string;
  onChange: (item: QuestionPickerItem) => void;
  onClose: () => void;
  options?: QuestionPickerOptions;
  value: Pick<QuestionPickerItem, "id" | "model">;
}

const canSelectItem = (item: QuestionPickerItem | null): boolean => {
  return !!item && (item.model === "card" || item.model === "dataset");
};

const searchFilter = (
  searchResults: QuestionPickerItem[],
): QuestionPickerItem[] => {
  return searchResults;
};

const defaultOptions: QuestionPickerOptions = {
  ...defaultEntityPickerOptions,
  ...defaultQuestionPickerOptions,
};

export const QuestionPickerModal = ({
  title = t`Choose a collection`,
  onChange,
  onClose,
  value,
  options = defaultOptions,
}: QuestionPickerModalProps) => {
  options = { ...defaultOptions, ...options };
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
      disabled={selectedItem?.can_write === false}
    >
      {t`Create a new collection`}
    </Button>,
  ];

  const tabs: [EntityTab<SearchModelType>, ...EntityTab<SearchModelType>[]] = [
    {
      displayName: t`Questions`,
      model: "card",
      icon: "table",
      element: (
        <QuestionPicker
          onItemSelect={handleItemSelect}
          initialValue={value}
          options={options}
          models={["card"]}
          ref={pickerRef}
        />
      ),
    },
    {
      displayName: t`Models`,
      model: "dataset",
      icon: "model",
      element: (
        <QuestionPicker
          onItemSelect={handleItemSelect}
          initialValue={value}
          options={options}
          models={["dataset"]}
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
