import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  CollectionItemModel,
  DatabaseId,
  RecentItem,
  TableId,
} from "metabase-types/api";

import type { EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import type { QuestionPickerItem } from "../../QuestionPicker";
import { QuestionPicker } from "../../QuestionPicker";
import { useAvailableData } from "../hooks";
import type {
  DataPickerModalOptions,
  DataPickerValue,
  NotebookDataPickerValueItem,
} from "../types";
import {
  createShouldShowItem,
  isModelItem,
  isQuestionItem,
  isTableItem,
  isValidValueItem,
} from "../utils";

import { TablePicker } from "./TablePicker";

interface Props {
  /**
   * Limit selection to a particular database
   */
  databaseId?: DatabaseId;
  title: string;
  value: DataPickerValue | undefined;
  models?: DataPickerValue["model"][];
  onChange: (value: TableId) => void;
  onClose: () => void;
}

const QUESTION_PICKER_MODELS: CollectionItemModel[] = ["card"];

const MODEL_PICKER_MODELS: CollectionItemModel[] = ["dataset"];

const options: DataPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
  showPersonalCollections: true,
  showRootCollection: true,
  hasRecents: true,
};

export const DataPickerModal = ({
  databaseId,
  title,
  value,
  models = ["table", "card", "dataset"],
  onChange,
  onClose,
}: Props) => {
  const hasNestedQueriesEnabled = useSetting("enable-nested-queries");
  const { hasQuestions, hasModels } = useAvailableData({
    databaseId,
  });

  const modelsShouldShowItem = useMemo(() => {
    return createShouldShowItem(["dataset"], databaseId);
  }, [databaseId]);

  const questionsShouldShowItem = useMemo(() => {
    return createShouldShowItem(["card"], databaseId);
  }, [databaseId]);

  const recentFilter = useCallback(
    (recentItems: RecentItem[]) => {
      if (databaseId) {
        return recentItems.filter(
          item => "database_id" in item && item.database_id === databaseId,
        );
      }

      return recentItems;
    },
    [databaseId],
  );

  const searchParams = useMemo(() => {
    return databaseId ? { table_db_id: databaseId } : undefined;
  }, [databaseId]);

  const handleChange = useCallback(
    (item: NotebookDataPickerValueItem) => {
      if (!isValidValueItem(item.model)) {
        return;
      }

      const id =
        item.model === "table" ? item.id : getQuestionVirtualTableId(item.id);
      onChange(id);
      onClose();
    },
    [onChange, onClose],
  );

  const handleCardChange = useCallback(
    (item: QuestionPickerItem) => {
      if (!isValidValueItem(item.model)) {
        return;
      }

      onChange(getQuestionVirtualTableId(item.id));
      onClose();
    },
    [onChange, onClose],
  );

  const tabs: EntityTab<NotebookDataPickerValueItem["model"]>[] = [
    hasModels && hasNestedQueriesEnabled
      ? {
          displayName: t`Models`,
          model: "dataset" as const,
          icon: "model",
          element: (
            <QuestionPicker
              initialValue={isModelItem(value) ? value : undefined}
              models={MODEL_PICKER_MODELS}
              options={options}
              shouldShowItem={modelsShouldShowItem}
              onItemSelect={handleCardChange}
            />
          ),
        }
      : undefined,
    {
      displayName: t`Tables`,
      model: "table" as const,
      icon: "table",
      element: (
        <TablePicker
          databaseId={databaseId}
          value={isTableItem(value) ? value : undefined}
          onChange={handleChange}
        />
      ),
    },
    hasQuestions && hasNestedQueriesEnabled
      ? {
          displayName: t`Saved questions`,
          model: "card" as const,
          icon: "folder",
          element: (
            <QuestionPicker
              initialValue={isQuestionItem(value) ? value : undefined}
              models={QUESTION_PICKER_MODELS}
              options={options}
              shouldShowItem={questionsShouldShowItem}
              onItemSelect={handleCardChange}
            />
          ),
        }
      : undefined,
  ].filter(
    (tab): tab is EntityTab<NotebookDataPickerValueItem["model"]> =>
      tab != null && models.includes(tab.model),
  );

  return (
    <EntityPickerModal
      canSelectItem
      recentFilter={recentFilter}
      defaultToRecentTab={false}
      initialValue={value}
      options={options}
      searchParams={searchParams}
      selectedItem={value ?? null}
      tabs={tabs}
      title={title}
      onClose={onClose}
      onItemSelect={handleChange}
    />
  );
};
