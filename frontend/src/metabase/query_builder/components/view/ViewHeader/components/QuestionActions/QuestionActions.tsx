import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { c, t } from "ttag";

import { skipToken, useListCardsQuery } from "metabase/api";
import { BookmarkToggle } from "metabase/common/components/BookmarkToggle";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { UploadInput } from "metabase/common/components/upload";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { runQuestionQuery } from "metabase/query_builder/actions";
import { QuestionMoreActionsMenu } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/QuestionMoreActionsMenu";
import type { QueryModalType } from "metabase/querying/constants";
import { useDispatch } from "metabase/redux";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase/redux/store";
import { UploadMode } from "metabase/redux/store/upload";
import { uploadFile } from "metabase/redux/uploads";
import { Box, Divider, Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

interface Props {
  isBookmarked: boolean;
  isShowingQuestionInfoSidebar: boolean;
  onToggleBookmark: () => void;
  onOpenModal: (modalType: QueryModalType) => void;
  question: Question;
  onSetQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
  onInfoClick: () => void;
}

export const QuestionActions = ({
  isBookmarked,
  isShowingQuestionInfoSidebar,
  onToggleBookmark,
  onOpenModal,
  question,
  onSetQueryBuilderMode,
  onInfoClick,
}: Props) => {
  const [uploadMode, setUploadMode] = useState<UploadMode>(UploadMode.append);

  const dispatch = useDispatch();

  useRegisterShortcut(
    [
      {
        id: "query-builder-info-sidebar",
        perform: onInfoClick,
      },
      {
        id: "query-builder-bookmark",
        perform: onToggleBookmark,
      },
    ],
    [isShowingQuestionInfoSidebar, isBookmarked],
  );

  const infoButtonColor = isShowingQuestionInfoSidebar
    ? "core-brand"
    : undefined;

  const hasCollectionPermissions = question.canWrite();
  const uploadTableId = question._card.based_on_upload;
  const canAppend = hasCollectionPermissions && !!uploadTableId;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadWarningModalOpen, setIsUploadWarningModalOpen] =
    useState(false);

  const { data: cardsBasedOnUploadTable, isLoading: isLoadingCards } =
    useListCardsQuery(
      typeof uploadTableId === "number"
        ? { f: "table", model_id: uploadTableId }
        : skipToken,
    );

  const otherModelNames = useMemo(
    () =>
      (cardsBasedOnUploadTable ?? [])
        .filter((card) => card.type === "model" && card.id !== question.id())
        .map((card) => card.name)
        .join(", "),
    [cardsBasedOnUploadTable, question],
  );

  const handleUploadClick = (
    newUploadMode: UploadMode.append | UploadMode.replace,
  ) => {
    setUploadMode(newUploadMode);

    if (otherModelNames.length > 0) {
      setIsUploadWarningModalOpen(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleUploadWarningConfirm = () => {
    setIsUploadWarningModalOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && question._card.based_on_upload) {
      dispatch(
        uploadFile({
          file,
          tableId: question._card.based_on_upload,
          onUploadComplete: () => dispatch(runQuestionQuery()),
          uploadMode,
        }),
      );

      // reset the file input so that subsequent uploads of the same file trigger the change handler
      if (fileInputRef.current?.value) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <Divider orientation="vertical" my="xs" />
      {!question.isArchived() && (
        <Box className={ViewTitleHeaderS.ViewHeaderIconButtonContainer}>
          <BookmarkToggle
            onCreateBookmark={onToggleBookmark}
            onDeleteBookmark={onToggleBookmark}
            isBookmarked={isBookmarked}
          />
        </Box>
      )}
      <Box className={ViewTitleHeaderS.ViewHeaderIconButtonContainer}>
        <ToolbarButton
          className={ViewTitleHeaderS.ViewHeaderIconButton}
          icon="info"
          onClick={onInfoClick}
          color={infoButtonColor}
          data-testid="qb-header-info-button"
          tooltipLabel={t`More info`}
          aria-label={t`More info`}
        />
      </Box>
      {canAppend && (
        <>
          <UploadInput
            id="upload-file-input"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Box className={ViewTitleHeaderS.ViewHeaderIconButtonContainer}>
            <Menu position="bottom-end">
              <Menu.Target>
                <ToolbarButton
                  className={ViewTitleHeaderS.ViewHeaderIconButton}
                  icon="upload"
                  color={infoButtonColor}
                  data-testid="qb-header-append-button"
                  tooltipLabel={t`Upload data to this model`}
                  aria-label={t`Upload data to this model`}
                />
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Icon name="add" />}
                  disabled={isLoadingCards}
                  onClick={() => handleUploadClick(UploadMode.append)}
                >
                  {t`Append data to this model`}
                </Menu.Item>

                <Menu.Item
                  leftSection={<Icon name="refresh" />}
                  disabled={isLoadingCards}
                  onClick={() => handleUploadClick(UploadMode.replace)}
                >
                  {t`Replace all data in this model`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Box>
          <ConfirmModal
            opened={isUploadWarningModalOpen}
            title={t`Upload data to this model?`}
            message={c(
              "{0} is a comma-separated list of model names sharing the same uploaded table",
            )
              .t`This model shares its underlying uploaded table with ${otherModelNames}. This CSV upload will also change the data for those models, along with any other questions or models based on them.`}
            confirmButtonText={t`Upload anyway`}
            onConfirm={handleUploadWarningConfirm}
            onClose={() => setIsUploadWarningModalOpen(false)}
          />
        </>
      )}
      {!question.isArchived() && (
        <QuestionMoreActionsMenu
          question={question}
          onOpenModal={onOpenModal}
          onSetQueryBuilderMode={onSetQueryBuilderMode}
        />
      )}
    </>
  );
};
