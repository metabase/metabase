import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  type ActionItem,
  type ActionPickerStatePath,
  // type DataPickerItem,
  // type DataPickerModalOptions,
  // type DataPickerValue,
  createQuestionPickerItemSelectHandler,
  createShouldShowItem,
  isModelItem,
  type ActionPickerItem,
  type DataPickerModalOptions,
} from "metabase/common/components/DataPicker";
import { useAvailableData } from "metabase/common/components/DataPicker/hooks";
import {
  EntityPickerContent,
  type EntityPickerOptions,
  type EntityPickerTab,
  defaultOptions,
} from "metabase/common/components/EntityPicker";
import { useLogRecentItem } from "metabase/common/components/EntityPicker/hooks";
import {
  QuestionPicker,
  type QuestionPickerStatePath,
} from "metabase/common/components/QuestionPicker";
import { useSetting } from "metabase/common/hooks";
import { ActionPicker } from "metabase-enterprise/table-actions/settings/ActionPicker";
import { isActionItem } from "metabase-enterprise/table-actions/settings/ActionPicker/utils";
import type {
  CollectionItemModel,
  RecentContexts,
  RecentItem,
} from "metabase-types/api";

type TableActionPickerProps = {
  value: ActionItem | undefined;
  onChange: (action: ActionItem) => void;
  onClose: () => void;
  children: ReactNode;
};

const QUESTION_PICKER_MODELS: CollectionItemModel[] = ["dataset"];

const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

const SEARCH_PARAMS = {
  include_dashboard_questions: true,
};

const options: Partial<EntityPickerOptions> = {
  ...defaultOptions,
  hasConfirmButtons: false,
  showPersonalCollections: true,
  showRootCollection: true,
  hasRecents: true,
};

export const TableOrModelDataPicker = ({
  value,
  onChange,
  onClose,
  children,
}: TableActionPickerProps) => {
  const hasNestedQueriesEnabled = useSetting("enable-nested-queries");
  const { hasModels, isLoading: isLoadingAvailableData } = useAvailableData({
    databaseId: undefined,
    models: ["dataset"],
  });

  const { tryLogRecentItem } = useLogRecentItem();

  const shouldShowItem = useMemo(() => {
    return createShouldShowItem(QUESTION_PICKER_MODELS);
  }, []);

  const recentFilter = useCallback(
    (recentItems: RecentItem[]) => recentItems,
    [],
  );

  const handleItemSelect = useCallback(
    (item: ActionPickerItem) => {
      if (!isActionItem(item)) {
        return;
      }

      onChange(item);
      tryLogRecentItem(item);
    },
    [onChange, tryLogRecentItem],
  );

  const [questionsPath, setQuestionsPath] = useState<QuestionPickerStatePath>();
  const [actionsPath, setActionsPath] = useState<ActionPickerStatePath>();

  const tabs = (function getTabs() {
    const computedTabs: EntityPickerTab<
      ActionPickerItem["id"],
      ActionPickerItem["model"],
      ActionPickerItem
    >[] = [
      {
        id: "tables-tab",
        displayName: t`Tables`,
        models: ["action" as const],
        folderModels: [
          "database" as const,
          "schema" as const,
          "table" as const,
        ],
        icon: "table",
        render: ({ onItemSelect }) => (
          <ActionPicker
            path={actionsPath}
            value={isActionItem(value) ? value : undefined}
            onItemSelect={onItemSelect}
            onPathChange={setActionsPath}
          >
            {children}
          </ActionPicker>
        ),
      },
    ];

    // const shouldShowCollectionsTab = hasModels && hasNestedQueriesEnabled;
    //
    // if (shouldShowCollectionsTab) {
    //   computedTabs.push({
    //     id: "models-tab",
    //     displayName: t`Models`,
    //     models: ["dataset" as const],
    //     folderModels: ["collection" as const, "dashboard" as const],
    //     icon: "folder",
    //     render: ({ onItemSelect }) => (
    //       <QuestionPicker
    //         initialValue={
    //           isModelItem(value as DataPickerValue) ? value : undefined
    //         }
    //         models={QUESTION_PICKER_MODELS}
    //         options={options}
    //         path={questionsPath}
    //         shouldShowItem={shouldShowItem}
    //         onInit={createQuestionPickerItemSelectHandler(onItemSelect)}
    //         onItemSelect={createQuestionPickerItemSelectHandler(onItemSelect)}
    //         onPathChange={setQuestionsPath}
    //       />
    //     ),
    //   });
    // }

    return computedTabs;
  })();

  return (
    <EntityPickerContent
      canSelectItem
      defaultToRecentTab={false}
      initialValue={value}
      options={options}
      recentsContext={RECENTS_CONTEXT}
      recentFilter={recentFilter}
      searchParams={SEARCH_PARAMS}
      selectedItem={value ?? null}
      tabs={tabs}
      title={t`Pick action to add`}
      onClose={onClose}
      onItemSelect={handleItemSelect}
      // isLoadingTabs={isLoadingAvailableData}
    />
  );
};
