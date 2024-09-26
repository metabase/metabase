import type { ChangeEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useSetting } from "metabase/common/hooks";
import EntityMenu from "metabase/components/EntityMenu";
import { UploadInput } from "metabase/components/upload";
import BookmarkToggle from "metabase/core/components/BookmarkToggle";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import { PLUGIN_QUERY_BUILDER_HEADER } from "metabase/plugins";
import { onOpenQuestionSettings } from "metabase/query_builder/actions";
import { trackTurnIntoModelClicked } from "metabase/query_builder/analytics";
import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { uploadFile } from "metabase/redux/uploads";
import { Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { checkCanBeModel } from "metabase-lib/v1/metadata/utils/models";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";
import { UploadMode } from "metabase-types/store/upload";

import { shouldShowQuestionSettingsSidebar } from "../../../sidebars/QuestionSettingsSidebar";
import { ViewHeaderIconButtonContainer } from "../../ViewTitleHeader.styled";

import {
  QuestionActionsDivider,
  StrengthIndicator,
} from "./QuestionActions.styled";

const HEADER_ICON_SIZE = 16;

const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
const MOVE_TESTID = "move-button";
const TURN_INTO_DATASET_TESTID = "turn-into-dataset";
const CLONE_TESTID = "clone-button";
const ARCHIVE_TESTID = "archive-button";

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
  onTurnModelIntoQuestion: () => void;
  onInfoClick: () => void;
  onModelPersistenceChange: () => void;
}

export const QuestionActions = ({
  isBookmarked,
  isShowingQuestionInfoSidebar,
  onToggleBookmark,
  onOpenModal,
  question,
  onSetQueryBuilderMode,
  onTurnModelIntoQuestion,
  onInfoClick,
}: Props) => {
  const [uploadMode, setUploadMode] = useState<UploadMode>(UploadMode.append);
  const isMetabotEnabled = useSetting("is-metabot-enabled");

  const dispatch = useDispatch();

  const onOpenSettingsSidebar = () => dispatch(onOpenQuestionSettings());

  const infoButtonColor = isShowingQuestionInfoSidebar
    ? color("brand")
    : undefined;

  const isQuestion = question.type() === "question";
  const isDashboardQuestion = isQuestion && _.isNumber(question.dashboardId());
  const isStandaloneQuestion =
    isQuestion && question.dashboardId() === undefined;
  const isModel = question.type() === "model";
  const isMetric = question.type() === "metric";
  const isModelOrMetric = isModel || isMetric;
  const hasCollectionPermissions = question.canWrite();
  const database = question.database();
  const canAppend =
    hasCollectionPermissions && !!question._card.based_on_upload;
  const { isEditable: hasDataPermissions } = Lib.queryDisplayInfo(
    question.query(),
  );
  const enableSettingsSidebar = shouldShowQuestionSettingsSidebar(question);

  const handleEditQuery = useCallback(() => {
    onSetQueryBuilderMode("dataset", {
      datasetEditorTab: "query",
    });
  }, [onSetQueryBuilderMode]);

  const handleEditMetadata = useCallback(() => {
    onSetQueryBuilderMode("dataset", {
      datasetEditorTab: "metadata",
    });
  }, [onSetQueryBuilderMode]);

  const handleTurnToModel = useCallback(() => {
    const modal = checkCanBeModel(question)
      ? MODAL_TYPES.TURN_INTO_DATASET
      : MODAL_TYPES.CAN_NOT_CREATE_MODEL;
    trackTurnIntoModelClicked(question);
    onOpenModal(modal);
  }, [onOpenModal, question]);

  const extraButtons = [];

  if (isStandaloneQuestion || isMetric) {
    extraButtons.push({
      title: t`Add to dashboard`,
      icon: "add_to_dash",
      action: () => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD),
      testId: ADD_TO_DASH_TESTID,
    });
  }

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

  if (hasCollectionPermissions) {
    if (isModelOrMetric && hasDataPermissions) {
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

  if (hasCollectionPermissions) {
    if (isStandaloneQuestion) {
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
        action: onTurnModelIntoQuestion,
      });
    }
  }

  extraButtons.push(...PLUGIN_QUERY_BUILDER_HEADER.extraButtons(question));

  if (enableSettingsSidebar) {
    extraButtons.push({
      title: t`Edit settings`,
      icon: "gear",
      action: onOpenSettingsSidebar,
      testId: "question-settings-button",
    });
  }

  if (hasCollectionPermissions) {
    extraButtons.push({
      separator: true,
      key: "move-separator",
    });
    extraButtons.push({
      title: t`Move`,
      icon: "move",
      action: () => onOpenModal(MODAL_TYPES.MOVE),
      testId: MOVE_TESTID,
    });
  }

  if (hasDataPermissions) {
    extraButtons.push({
      title: t`Duplicate`,
      icon: "clone",
      action: () => onOpenModal(MODAL_TYPES.CLONE),
      testId: CLONE_TESTID,
    });
  }

  if (hasCollectionPermissions) {
    extraButtons.push({
      separator: true,
      key: "trash-separator",
    });

    if (isStandaloneQuestion) {
      extraButtons.push({
        title: t`Move to trash`,
        icon: "trash",
        action: () => onOpenModal(MODAL_TYPES.ARCHIVE),
        testId: ARCHIVE_TESTID,
      });
    }
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
            onCreateBookmark={onToggleBookmark}
            onDeleteBookmark={onToggleBookmark}
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
          triggerAriaLabel={
            isDashboardQuestion
              ? t`Move, duplicate, and more...`
              : t`Move, trash, and more...`
          }
          items={extraButtons}
          triggerIcon="ellipsis"
          tooltip={
            isDashboardQuestion
              ? t`Move, duplicate, and more...`
              : t`Move, trash, and more...`
          }
        />
      )}
    </>
  );
};
