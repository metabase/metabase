import { useMemo, useState } from "react";
import { t } from "ttag";

import { useLogRecentItemMutation } from "metabase/api";
import {
  EntityPickerModal,
  type EntityPickerModalOptions,
  type EntityPickerTab,
  defaultOptions,
} from "metabase/common/components/EntityPicker";
import {
  QuestionPicker,
  type QuestionPickerOptions,
  type QuestionPickerStatePath,
} from "metabase/common/components/Pickers/QuestionPicker";
import {
  TablePicker,
  type TablePickerStatePath,
} from "metabase/common/components/Pickers/TablePicker/TablePicker";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import {
  type DependencyEntry,
  type DependencyNode,
  type RecentContexts,
  isActivityModel,
} from "metabase-types/api";

import type { EntryPickerItem } from "./types";
import {
  filterRecents,
  getEntryPickerItem,
  getEntryPickerValue,
  getQuestionPickerItem,
  getTablePickerValue,
  getTransformPickerItem,
} from "./utils";

type EntryPickerModalProps = {
  value: DependencyNode | undefined;
  onChange: (value: DependencyEntry) => void;
  onClose: () => void;
};

const ENTITY_PICKER_OPTIONS: EntityPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
  hasRecents: true,
};

const QUESTION_PICKER_OPTIONS: QuestionPickerOptions = {
  showRootCollection: true,
  showPersonalCollections: true,
};

const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

export function EntryPickerModal({
  value,
  onChange,
  onClose,
}: EntryPickerModalProps) {
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();
  const [questionsPath, setQuestionsPath] = useState<QuestionPickerStatePath>();
  const [logRecentItem] = useLogRecentItemMutation();

  const selectedItem = useMemo(() => {
    return value != null ? getEntryPickerItem(value) : undefined;
  }, [value]);

  const tabs = useMemo(() => {
    const computedTabs: EntityPickerTab<
      EntryPickerItem["id"],
      EntryPickerItem["model"],
      EntryPickerItem
    >[] = [];

    computedTabs.push({
      id: "tables-tab",
      displayName: t`Tables`,
      models: ["table"],
      folderModels: ["database", "schema"],
      icon: "table",
      render: ({ onItemSelect }) => (
        <TablePicker
          value={value ? getTablePickerValue(value) : undefined}
          path={tablesPath}
          onItemSelect={onItemSelect}
          onPathChange={setTablesPath}
        />
      ),
    });

    computedTabs.push({
      id: "transforms-tab",
      displayName: t`Transforms`,
      models: ["transform"],
      folderModels: [],
      icon: "refresh_downstream",
      render: ({ onItemSelect }) => (
        <PLUGIN_TRANSFORMS.TransformPicker
          value={value ? getTransformPickerItem(value) : undefined}
          onItemSelect={onItemSelect}
        />
      ),
    });

    computedTabs.push({
      id: "collections-tab",
      displayName: t`Collections`,
      models: ["card", "dataset", "metric"],
      folderModels: ["collection", "dashboard"],
      icon: "folder",
      render: ({ onItemSelect }) => (
        <QuestionPicker
          initialValue={value ? getQuestionPickerItem(value) : undefined}
          models={["card", "dataset", "metric"]}
          options={QUESTION_PICKER_OPTIONS}
          path={questionsPath}
          onInit={onItemSelect}
          onItemSelect={onItemSelect}
          onPathChange={setQuestionsPath}
        />
      ),
    });

    return computedTabs;
  }, [value, tablesPath, questionsPath]);

  const handleItemSelect = (item: EntryPickerItem) => {
    const value = getEntryPickerValue(item);
    if (value != null) {
      if (isActivityModel(item.model)) {
        logRecentItem({ model: item.model, model_id: value.id });
      }

      onChange(value);
    }
  };

  return (
    <EntityPickerModal
      title={t`Pick an entity to analyze`}
      tabs={tabs}
      initialValue={selectedItem}
      selectedItem={selectedItem ?? null}
      options={ENTITY_PICKER_OPTIONS}
      recentFilter={filterRecents}
      recentsContext={RECENTS_CONTEXT}
      canSelectItem
      defaultToRecentTab={false}
      onItemSelect={handleItemSelect}
      onClose={onClose}
    />
  );
}
