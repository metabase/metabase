import type { ChangeEvent } from "react";
import { useCallback, useState, useRef } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import EntityMenu from "metabase/components/EntityMenu";
import { UploadInput } from "metabase/components/upload";
import BookmarkToggle from "metabase/core/components/BookmarkToggle";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import {
  PLUGIN_MODEL_PERSISTENCE,
  PLUGIN_MODERATION,
  PLUGIN_QUERY_BUILDER_HEADER,
} from "metabase/plugins";
import { softReloadCard } from "metabase/query_builder/actions";
import { trackTurnIntoModelClicked } from "metabase/query_builder/analytics";
import {
  MODAL_TYPES,
  type QBModalTypeKey,
} from "metabase/query_builder/constants";
import { uploadFile } from "metabase/redux/uploads";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import {
  checkCanBeModel,
  checkDatabaseCanPersistDatasets,
} from "metabase-lib/v1/metadata/utils/models";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";
import { UploadMode } from "metabase-types/store/upload";

import { ViewHeaderIconButtonContainer } from "../../ViewHeader.styled";

import {
  QuestionActionsDivider,
  StrengthIndicator,
} from "./QuestionActions.styled";

const HEADER_ICON_SIZE = 16;

const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
const MOVE_TESTID = "move-button";
const TURN_INTO_DATASET_TESTID = "turn-into-dataset";
const TOGGLE_MODEL_PERSISTENCE_TESTID = "toggle-persistence";
const CLONE_TESTID = "clone-button";
const ARCHIVE_TESTID = "archive-button";

interface Props {
  isBookmarked: boolean;
  isShowingQuestionInfoSidebar: boolean;
  handleBookmark: () => void;
  onOpenModal: (modalType: QBModalTypeKey) => void;
  question: Question;
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opt: { datasetEditorTab: DatasetEditorTab },
  ) => void;
  turnDatasetIntoQuestion: () => void;
  onInfoClick: () => void;
  onModelPersistenceChange: () => void;
}

export const QuestionActions = ({
  isBookmarked,
  isShowingQuestionInfoSidebar,
  handleBookmark,
  onOpenModal,
  question,
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
  onInfoClick,
  onModelPersistenceChange,
}: Props) => {
  const [uploadMode, setUploadMode] = useState<UploadMode>(UploadMode.append);
  const isMetabotEnabled = useSetting("is-metabot-enabled");

  const isModerator = useSelector(getUserIsAdmin) && question.canWrite?.();

  const dispatch = useDispatch();

  const dispatchSoftReloadCard = () => dispatch(softReloadCard());

  const infoButtonColor = isShowingQuestionInfoSidebar
    ? color("brand")
    : undefined;

  const isQuestion = question.type() === "question";
  const isModel = question.type() === "model";
  const isMetric = question.type() === "metric";
  const isModelOrMetric = isModel || isMetric;
  const canWrite = question.canWrite();
  const isSaved = question.isSaved();
  const database = question.database();
  const canAppend = canWrite && !!question._card.based_on_upload;

  const canPersistDataset =
    PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled() &&
    canWrite &&
    isSaved &&
    isModel &&
    checkDatabaseCanPersistDatasets(question.database());

  const handleEditQuery = useCallback(() => {
    setQueryBuilderMode("dataset", {
      datasetEditorTab: "query",
    });
  }, [setQueryBuilderMode]);

  const handleEditMetadata = useCallback(() => {
    setQueryBuilderMode("dataset", {
      datasetEditorTab: "metadata",
    });
  }, [setQueryBuilderMode]);

  const handleTurnToModel = useCallback(() => {
    const modal = checkCanBeModel(question)
      ? MODAL_TYPES.TURN_INTO_DATASET
      : MODAL_TYPES.CAN_NOT_CREATE_MODEL;
    trackTurnIntoModelClicked(question);
    onOpenModal(modal);
  }, [onOpenModal, question]);

  const extraButtons = [];

  if (
    isMetabotEnabled &&
    isModel &&
    database &&
    canUseMetabotOnDatabase(database)
  ) {
    extraButtons.push({
      title: t`Ask Metabot`,
      icon: "insight",
      link: Urls.modelMetabot(question.id()),
    });
  }

  extraButtons.push(
    ...PLUGIN_MODERATION.getMenuItems(
      question,
      isModerator,
      dispatchSoftReloadCard,
    ),
  );

  if (canWrite) {
    if (isModelOrMetric) {
      extraButtons.push({
        title: isMetric ? t`Edit metric definition` : t`Edit query definition`,
        icon: "notebook",
        action: handleEditQuery,
      });
    }

    if (isModel) {
      extraButtons.push({
        title: (
          <div>
            {t`Edit metadata`} <StrengthIndicator dataset={question} />
          </div>
        ),
        icon: "label",
        action: handleEditMetadata,
      });
    }
  }

  if (canPersistDataset) {
    extraButtons.push({
      ...PLUGIN_MODEL_PERSISTENCE.getMenuItems(
        question,
        onModelPersistenceChange,
      ),
      testId: TOGGLE_MODEL_PERSISTENCE_TESTID,
    });
  }

  if (isQuestion) {
    extraButtons.push({
      title: t`Add to dashboard`,
      icon: "add_to_dash",
      action: () => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD),
      testId: ADD_TO_DASH_TESTID,
    });
  }

  if (canWrite) {
    extraButtons.push({
      title: t`Move`,
      icon: "move",
      action: () => onOpenModal(MODAL_TYPES.MOVE),
      testId: MOVE_TESTID,
    });
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  if (isEditable) {
    extraButtons.push({
      title: t`Duplicate`,
      icon: "clone",
      action: () => onOpenModal(MODAL_TYPES.CLONE),
      testId: CLONE_TESTID,
    });
  }

  if (canWrite) {
    if (isQuestion) {
      extraButtons.push({
        title: t`Turn into a model`,
        icon: "model",
        action: handleTurnToModel,
        testId: TURN_INTO_DATASET_TESTID,
      });
    }
    if (isModel) {
      extraButtons.push({
        title: t`Turn back to saved question`,
        icon: "insight",
        action: turnDatasetIntoQuestion,
      });
    }
  }

  extraButtons.push(...PLUGIN_QUERY_BUILDER_HEADER.extraButtons(question));

  if (canWrite) {
    extraButtons.push({
      title: t`Move to trash`,
      icon: "trash",
      action: () => onOpenModal(MODAL_TYPES.ARCHIVE),
      testId: ARCHIVE_TESTID,
    });
  }

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
      <QuestionActionsDivider />
      {!question.isArchived() && (
        <ViewHeaderIconButtonContainer>
          <BookmarkToggle
            onCreateBookmark={handleBookmark}
            onDeleteBookmark={handleBookmark}
            isBookmarked={isBookmarked}
          />
        </ViewHeaderIconButtonContainer>
      )}
      <Tooltip tooltip={t`More info`}>
        <ViewHeaderIconButtonContainer>
          <Button
            onlyIcon
            icon="info"
            iconSize={HEADER_ICON_SIZE}
            onClick={onInfoClick}
            color={infoButtonColor}
            data-testid="qb-header-info-button"
          />
        </ViewHeaderIconButtonContainer>
      </Tooltip>
      {canAppend && (
        <>
          <UploadInput
            id="upload-file-input"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Tooltip tooltip={t`Upload data to this model`}>
            <ViewHeaderIconButtonContainer>
              <Menu position="bottom-end">
                <Menu.Target>
                  <Button
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
            </ViewHeaderIconButtonContainer>
          </Tooltip>
        </>
      )}
      {extraButtons.length > 0 && !question.isArchived() && (
        <EntityMenu
          triggerAriaLabel={t`Move, trash, and more...`}
          items={extraButtons}
          triggerIcon="ellipsis"
          tooltip={t`Move, trash, and more...`}
        />
      )}
    </>
  );
};
