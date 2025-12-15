import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { canDownloadResults } from "metabase/dashboard/components/DashCard/DashCardMenu/utils";
import { isWithinIframe } from "metabase/lib/dom";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

export interface CardEmbedMenuContext {
  canWrite: boolean;
  dataset: Dataset | undefined;
  question: Question | undefined;
  isNativeQuestion: boolean | undefined;
  commentsPath: string;
  hasUnsavedChanges: boolean;
  unresolvedCommentsCount: number;
}

export interface CardEmbedMenuActions {
  handleDownload: (opts: {
    type: string;
    enableFormatting: boolean;
    enablePivot: boolean;
  }) => Promise<void>;
  handleEditVisualizationSettings: () => void;
  setIsModifyModalOpen: (open: boolean) => void;
  handleReplaceQuestion: () => void;
  handleRemoveNode: () => void;
  handleAddSupportingText?: () => void;
}

export interface CardEmbedMenuState {
  menuView: string | null;
  setMenuView: (view: string | null) => void;
  isDownloadingData: boolean;
}

export type CardEmbedMenuDropdownProps = CardEmbedMenuContext &
  CardEmbedMenuActions &
  CardEmbedMenuState;
export const CardEmbedMenuDropdown = ({
  // Context
  canWrite,
  dataset,
  question,
  isNativeQuestion,
  commentsPath,
  hasUnsavedChanges,
  unresolvedCommentsCount,
  // Actions
  handleDownload,
  handleEditVisualizationSettings,
  setIsModifyModalOpen,
  handleReplaceQuestion,
  handleRemoveNode,
  handleAddSupportingText,
  // State
  menuView,
  setMenuView,
  isDownloadingData,
}: CardEmbedMenuDropdownProps) => {
  if (menuView === "downloads" && question && dataset) {
    return (
      <QuestionDownloadWidget
        question={question}
        result={dataset}
        onDownload={async (opts) => {
          setMenuView(null);

          await handleDownload(opts);
        }}
      />
    );
  }

  return (
    <>
      {!isWithinIframe() && canWrite && (
        <Menu.Item
          leftSection={<Icon name="add_comment" size={14} />}
          component={ForwardRefLink}
          to={
            unresolvedCommentsCount > 0
              ? commentsPath
              : `${commentsPath}?new=true`
          }
          onClick={(e) => {
            if (!commentsPath || hasUnsavedChanges) {
              e.preventDefault();
            }
          }}
          disabled={!commentsPath || hasUnsavedChanges}
        >
          {t`Comment`}
        </Menu.Item>
      )}
      <Menu.Item
        onClick={handleAddSupportingText}
        disabled={!canWrite || !handleAddSupportingText}
        leftSection={<Icon name="add_list" size={14} />}
      >
        {t`Add supporting text`}
      </Menu.Item>
      <Menu.Item
        onClick={handleEditVisualizationSettings}
        leftSection={<Icon name="palette" size={14} />}
        disabled={!canWrite}
      >
        {t`Edit Visualization`}
      </Menu.Item>
      <Menu.Item
        onClick={() => setIsModifyModalOpen(true)}
        leftSection={
          <Icon name={isNativeQuestion ? "sql" : "notebook"} size={14} />
        }
        disabled={!canWrite}
      >
        {t`Edit Query`}
      </Menu.Item>
      <Menu.Item
        onClick={handleReplaceQuestion}
        leftSection={<Icon name="refresh" size={14} />}
        disabled={!canWrite}
      >
        {t`Replace`}
      </Menu.Item>
      {canDownloadResults(dataset) && (
        <Menu.Item
          leftSection={<Icon name="download" aria-hidden />}
          aria-label={isDownloadingData ? t`Downloading…` : t`Download results`}
          disabled={isDownloadingData}
          closeMenuOnClick={false}
          onClick={() => {
            setMenuView("downloads");
          }}
        >
          {isDownloadingData ? t`Downloading…` : t`Download results`}
        </Menu.Item>
      )}
      <Menu.Item
        onClick={handleRemoveNode}
        leftSection={<Icon name="trash" size={14} />}
        disabled={!canWrite}
      >
        {t`Remove Chart`}
      </Menu.Item>
    </>
  );
};
