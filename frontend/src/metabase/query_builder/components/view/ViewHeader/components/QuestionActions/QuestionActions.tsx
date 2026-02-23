import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import { BookmarkToggle } from "metabase/common/components/BookmarkToggle";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { UploadInput } from "metabase/common/components/upload";
import { DataStudioToolbarButton } from "metabase/data-studio/query-builder/components/DataStudioToolbarButton";
import { getLibraryCollectionType } from "metabase/data-studio/utils";
import { useDispatch } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { QuestionMoreActionsMenu } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/QuestionMoreActionsMenu";
import type { QueryModalType } from "metabase/query_builder/constants";
import { uploadFile } from "metabase/redux/uploads";
import { Box, Divider, Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";
import { UploadMode } from "metabase-types/store/upload";

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

  const infoButtonColor = isShowingQuestionInfoSidebar ? "brand" : undefined;

  const hasCollectionPermissions = question.canWrite();
  const canAppend =
    hasCollectionPermissions && !!question._card.based_on_upload;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = (
    newUploadMode: UploadMode.append | UploadMode.replace,
  ) => {
    if (fileInputRef.current) {
      setUploadMode(newUploadMode);
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && question._card.based_on_upload) {
      dispatch(
        uploadFile({
          file,
          tableId: question._card.based_on_upload,
          reloadQuestionData: true,
          uploadMode,
        }),
      );

      // reset the file input so that subsequent uploads of the same file trigger the change handler
      if (fileInputRef.current?.value) {
        fileInputRef.current.value = "";
      }
    }
  };

  const shouldShowDataStudioLink =
    getLibraryCollectionType(question.collection()?.type) != null;

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
                  onClick={() => handleUploadClick(UploadMode.append)}
                >
                  {t`Append data to this model`}
                </Menu.Item>

                <Menu.Item
                  leftSection={<Icon name="refresh" />}
                  onClick={() => handleUploadClick(UploadMode.replace)}
                >
                  {t`Replace all data in this model`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Box>
        </>
      )}
      {!question.isArchived() && !shouldShowDataStudioLink && (
        <QuestionMoreActionsMenu
          question={question}
          onOpenModal={onOpenModal}
          onSetQueryBuilderMode={onSetQueryBuilderMode}
        />
      )}
      {shouldShowDataStudioLink && (
        <DataStudioToolbarButton question={question} />
      )}
    </>
  );
};
