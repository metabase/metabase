import { useMemo, useState } from "react";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import {
  EntityPickerModal,
  type EntityPickerOptions,
  type EntityPickerTab,
} from "metabase/common/components/EntityPicker";
import {
  CollectionPicker,
  type CollectionPickerStatePath,
} from "metabase/common/components/Pickers/CollectionPicker";
import {
  DashboardPicker,
  type DashboardPickerStatePath,
} from "metabase/common/components/Pickers/DashboardPicker";
import {
  QuestionPicker,
  type QuestionPickerStatePath,
} from "metabase/common/components/Pickers/QuestionPicker";
import {
  TablePicker,
  type TablePickerStatePath,
} from "metabase/common/components/Pickers/TablePicker";

import {
  COLLECTION_PICKER_OPTIONS,
  DASHBOARD_PICKER_OPTIONS,
  ENTITY_PICKER_OPTIONS,
  QUESTION_PICKER_OPTIONS,
  RECENTS_CONTEXT,
} from "./constants";
import type {
  DocumentLinkedEntityPickerItem,
  DocumentLinkedEntityPickerItemId,
  DocumentLinkedEntityPickerItemModel,
} from "./types";
import { getCanSelectItem, hasAvailableModels } from "./utils";

interface LinkedEntityPickerModalProps {
  value: DocumentLinkedEntityPickerItem | null;
  options?: Partial<EntityPickerOptions>;
  onChange: (value: DocumentLinkedEntityPickerItem) => void;
  onConfirm?: () => void;
  onClose: () => void;
}

export function LinkedEntityPickerModal({
  value,
  options,
  onChange,
  onClose,
  onConfirm,
}: LinkedEntityPickerModalProps) {
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();
  const [questionsPath, setQuestionsPath] = useState<QuestionPickerStatePath>();
  const [modelsPath, setModelsPath] = useState<QuestionPickerStatePath>();
  const [metricsPath, setMetricsPath] = useState<QuestionPickerStatePath>();
  const [dashboardsPath, setDashboardsPath] =
    useState<DashboardPickerStatePath>();
  const [collectionsPath, setCollectionsPath] =
    useState<CollectionPickerStatePath>();

  const { data: searchResponse, isLoading: isSearchLoading } = useSearchQuery({
    models: ["card"],
    limit: 0,
    calculate_available_models: true,
  });

  const computedOptions = useMemo(
    () => ({
      ...ENTITY_PICKER_OPTIONS,
      ...(options || null),
    }),
    [options],
  );

  const tabs = useMemo(() => {
    const computedTabs: EntityPickerTab<
      DocumentLinkedEntityPickerItemId,
      DocumentLinkedEntityPickerItemModel,
      DocumentLinkedEntityPickerItem
    >[] = [];

    computedTabs.push({
      id: "tables-tab",
      displayName: t`Tables`,
      models: ["table"],
      folderModels: ["database", "schema"],
      icon: "table",
      render: ({ onItemSelect }) => (
        <TablePicker
          value={undefined}
          path={tablesPath}
          onItemSelect={onItemSelect}
          onPathChange={setTablesPath}
        />
      ),
    });

    if (hasAvailableModels(searchResponse, ["card"])) {
      computedTabs.push({
        id: "questions-tab",
        displayName: t`Questions`,
        models: ["card"],
        folderModels: ["collection", "dashboard"],
        icon: "table2",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={undefined}
            models={["card", "dashboard"]}
            options={QUESTION_PICKER_OPTIONS}
            path={questionsPath}
            onInit={onItemSelect}
            onItemSelect={onItemSelect}
            onPathChange={setQuestionsPath}
          />
        ),
      });
    }

    if (hasAvailableModels(searchResponse, ["dataset"])) {
      computedTabs.push({
        id: "models-tab",
        displayName: t`Models`,
        models: ["dataset"],
        folderModels: ["collection"],
        icon: "model",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={undefined}
            models={["dataset"]}
            options={QUESTION_PICKER_OPTIONS}
            path={modelsPath}
            onInit={onItemSelect}
            onItemSelect={onItemSelect}
            onPathChange={setModelsPath}
          />
        ),
      });
    }

    if (hasAvailableModels(searchResponse, ["metric"])) {
      computedTabs.push({
        id: "metrics-tab",
        displayName: t`Metrics`,
        models: ["metric"],
        folderModels: ["collection"],
        icon: "metric",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={undefined}
            models={["metric"]}
            options={DASHBOARD_PICKER_OPTIONS}
            path={metricsPath}
            onInit={onItemSelect}
            onItemSelect={onItemSelect}
            onPathChange={setMetricsPath}
          />
        ),
      });
    }

    if (hasAvailableModels(searchResponse, ["dashboard"])) {
      computedTabs.push({
        id: "dashboards-tab",
        displayName: t`Dashboards`,
        models: ["dashboard"],
        folderModels: ["collection"],
        icon: "dashboard",
        render: ({ onItemSelect }) => (
          <DashboardPicker
            initialValue={undefined}
            models={["dashboard"]}
            options={QUESTION_PICKER_OPTIONS}
            path={dashboardsPath}
            onItemSelect={onItemSelect}
            onPathChange={setDashboardsPath}
          />
        ),
      });
    }

    computedTabs.push({
      id: "collections-tab",
      displayName: t`Collections`,
      models: ["collection"],
      folderModels: ["collection"],
      icon: "collection",
      render: ({ onItemSelect }) => (
        <CollectionPicker
          initialValue={undefined}
          models={["collection"]}
          options={COLLECTION_PICKER_OPTIONS}
          path={collectionsPath}
          onInit={onItemSelect}
          onItemSelect={onItemSelect}
          onPathChange={setCollectionsPath}
        />
      ),
    });

    return computedTabs;
  }, [
    searchResponse,
    tablesPath,
    questionsPath,
    modelsPath,
    metricsPath,
    dashboardsPath,
    collectionsPath,
  ]);

  return (
    <EntityPickerModal
      title={t`Choose an item to link`}
      tabs={tabs}
      initialValue={value || undefined}
      selectedItem={value ?? null}
      options={computedOptions}
      recentsContext={RECENTS_CONTEXT}
      isLoadingTabs={isSearchLoading}
      canSelectItem={getCanSelectItem(value)}
      onItemSelect={onChange}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
