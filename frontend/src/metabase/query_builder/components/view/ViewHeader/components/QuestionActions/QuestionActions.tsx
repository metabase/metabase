import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { UploadInput } from "metabase/components/upload";
import BookmarkToggle from "metabase/core/components/BookmarkToggle";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { QuestionMoreActionsMenu } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/QuestionMoreActionsMenu";
import type { QueryModalType } from "metabase/query_builder/constants";
import { uploadFile } from "metabase/redux/uploads";
import { Box, Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";
import { UploadMode } from "metabase-types/store/upload";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

import QuestionActionsS from "./QuestionActions.module.css";

const HEADER_ICON_SIZE = 16;

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

  const infoButtonColor = isShowingQuestionInfoSidebar
    ? color("brand")
    : undefined;

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

  return (
    <>
      <Box className={QuestionActionsS.QuestionActionsDivider} />
      {!question.isArchived() && (
        <Box className={ViewTitleHeaderS.ViewHeaderIconButtonContainer}>
          <BookmarkToggle
            className={ViewTitleHeaderS.ViewHeaderIconButton}
            onCreateBookmark={onToggleBookmark}
            onDeleteBookmark={onToggleBookmark}
            isBookmarked={isBookmarked}
          />
        </Box>
      )}
      <Tooltip tooltip={t`More info`}>
        <Box className={ViewTitleHeaderS.ViewHeaderIconButtonContainer}>
          <Button
            className={ViewTitleHeaderS.ViewHeaderIconButton}
            onlyIcon
            icon="info"
            iconSize={HEADER_ICON_SIZE}
            onClick={onInfoClick}
            color={infoButtonColor}
            data-testid="qb-header-info-button"
          />
        </Box>
      </Tooltip>
      {canAppend && (
        <>
          <UploadInput
            id="upload-file-input"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Tooltip tooltip={t`Upload data to this model`}>
            <Box className={ViewTitleHeaderS.ViewHeaderIconButtonContainer}>
              <Menu position="bottom-end">
                <Menu.Target>
                  <Button
                    className={ViewTitleHeaderS.ViewHeaderIconButton}
                    onlyIcon
                    icon="upload"
                    iconSize={HEADER_ICON_SIZE}
                    color={infoButtonColor}
                    data-testid="qb-header-append-button"
                  />
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    icon={<Icon name="add" />}
                    onClick={() => handleUploadClick(UploadMode.append)}
                  >
                    {t`Append data to this model`}
                  </Menu.Item>

                  <Menu.Item
                    icon={<Icon name="refresh" />}
                    onClick={() => handleUploadClick(UploadMode.replace)}
                  >
                    {t`Replace all data in this model`}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Box>
          </Tooltip>
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
