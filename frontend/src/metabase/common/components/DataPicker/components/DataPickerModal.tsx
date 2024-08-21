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
import { useLogRecentItem } from "../../EntityPicker/hooks/use-log-recent-item";
import type { QuestionPickerItem } from "../../QuestionPicker";
import { QuestionPicker } from "../../QuestionPicker";
import { useAvailableData } from "../hooks";
import type {
  DataPickerModalOptions,
  DataPickerValue,
  NotebookDataPickerValueItem,
  TablePickerValue,
} from "../types";
import {
  createShouldShowItem,
  isMetricItem,
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

const METRIC_PICKER_MODELS: CollectionItemModel[] = ["metric"];

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
  const { hasQuestions, hasModels, hasMetrics } = useAvailableData({
    databaseId,
  });

  const { tryLogRecentItem } = useLogRecentItem();

  const modelsShouldShowItem = useMemo(() => {
    return createShouldShowItem(["dataset"], databaseId);
  }, [databaseId]);

  const metricsShouldShowItem = useMemo(() => {
    return createShouldShowItem(["metric"], databaseId);
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
      tryLogRecentItem(item);
      onClose();
    },
    [onChange, onClose, tryLogRecentItem],
  );

  const handleCardChange = useCallback(
    (item: QuestionPickerItem) => {
      if (!isValidValueItem(item.model)) {
        return;
      }
      onChange(getQuestionVirtualTableId(item.id));
      tryLogRecentItem(item);
      onClose();
    },
    [onChange, onClose, tryLogRecentItem],
  );


  const tabs: EntityTab<NotebookDataPickerValueItem["model"]>[] = [
    /*hasModels && hasNestedQueriesEnabled
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
      : undefined,*/
    {
      displayName: t`Raw Data`,
      model: "table" as const,
      icon: "table",
      element: (
        <TablePicker
          databaseId={databaseId}
          value={value}
          onChange={handleChange}
          shouldShowDatabase={database => database.is_cube === true}// Filtra las bases de datos donde is_cube es true
        />

      ),
    },
    {
      displayName: t`Semantic Layer`,
      model: "semantic" as const,
      icon: "table",
      element: (
        <TablePicker
          databaseId={databaseId}
          value={value}
          onChange={handleChange}
          shouldShowDatabase={database => database.is_cube === false}// Filtra las bases de datos donde is_cube es true
        />

      ),
    },
    /*hasQuestions && hasNestedQueriesEnabled
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
      : undefined*/ 
  ];

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
      recentsContext={["selections"]}
    />
  );
};
