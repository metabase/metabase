import { match } from "ts-pattern";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { QuestionDownloadWidget } from "metabase/common/components/QuestionDownloadWidget";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import type { CardEmbedMenuItem } from "./card-embed-menu-items";

export interface CardEmbedMenuContext {
  items: CardEmbedMenuItem[];
  dataset: Dataset | undefined;
  question: Question | undefined;
  isNativeQuestion: boolean | undefined;
  commentsPath: string;
}

export interface CardEmbedMenuActions {
  handleDownload: (opts: {
    type: string;
    enableFormatting: boolean;
    enablePivot: boolean;
  }) => Promise<void>;
  handleEditVisualizationSettings: () => void;
  handleEditTimelineEvents?: () => void;
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
  items,
  dataset,
  question,
  isNativeQuestion,
  commentsPath,
  // Actions
  handleDownload,
  handleEditVisualizationSettings,
  handleEditTimelineEvents,
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
      {items.map(({ id, isEnabled }) =>
        match(id)
          .with("comment", () => (
            <Menu.Item
              key={id}
              leftSection={<Icon name="add_comment" size={14} />}
              component={ForwardRefLink}
              to={commentsPath}
              onClick={(e) => {
                if (!isEnabled) {
                  e.preventDefault();
                }
              }}
              disabled={!isEnabled}
            >
              {t`Comment`}
            </Menu.Item>
          ))
          .with("add-supporting-text", () => (
            <Menu.Item
              key={id}
              onClick={handleAddSupportingText}
              disabled={!isEnabled}
              leftSection={<Icon name="add_list" size={14} />}
            >
              {t`Add supporting text`}
            </Menu.Item>
          ))
          .with("edit-visualization", () => (
            <Menu.Item
              key={id}
              onClick={handleEditVisualizationSettings}
              leftSection={<Icon name="palette" size={14} />}
              disabled={!isEnabled}
            >
              {t`Edit Visualization`}
            </Menu.Item>
          ))
          .with("edit-timeline-events", () => (
            <Menu.Item
              key={id}
              leftSection={<Icon name="calendar" size={14} />}
              onClick={handleEditTimelineEvents}
              disabled={!isEnabled}
            >
              {t`Events`}
            </Menu.Item>
          ))
          .with("edit-query", () => (
            <Menu.Item
              key={id}
              onClick={() => setIsModifyModalOpen(true)}
              leftSection={
                <Icon name={isNativeQuestion ? "sql" : "notebook"} size={14} />
              }
              disabled={!isEnabled}
            >
              {t`Edit Query`}
            </Menu.Item>
          ))
          .with("replace", () => (
            <Menu.Item
              key={id}
              onClick={handleReplaceQuestion}
              leftSection={<Icon name="refresh" size={14} />}
              disabled={!isEnabled}
            >
              {t`Replace`}
            </Menu.Item>
          ))
          .with("download", () => (
            <Menu.Item
              key={id}
              leftSection={<Icon name="download" aria-hidden />}
              aria-label={
                isDownloadingData ? t`Downloading…` : t`Download results`
              }
              disabled={!isEnabled || isDownloadingData}
              closeMenuOnClick={false}
              onClick={() => {
                setMenuView("downloads");
              }}
            >
              {isDownloadingData ? t`Downloading…` : t`Download results`}
            </Menu.Item>
          ))
          .with("remove", () => (
            <Menu.Item
              key={id}
              onClick={handleRemoveNode}
              leftSection={<Icon name="trash" size={14} />}
              disabled={!isEnabled}
            >
              {t`Remove Chart`}
            </Menu.Item>
          ))
          .exhaustive(),
      )}
    </>
  );
};
