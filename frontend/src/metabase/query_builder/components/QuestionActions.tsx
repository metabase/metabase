import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/components/Tooltip";

import { PLUGIN_MODERATION, PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";

import { MODAL_TYPES } from "metabase/query_builder/constants";

import { softReloadCard } from "metabase/query_builder/actions";
import { getUserIsAdmin } from "metabase/selectors/user";

import { State } from "metabase-types/store";
import { color } from "metabase/lib/colors";
import {
  checkCanBeModel,
  checkDatabaseCanPersistDatasets,
} from "metabase/lib/data-modeling/utils";

import Question from "metabase-lib/lib/Question";

import {
  QuestionActionsDivider,
  BookmarkButton,
  AnimationStates,
  StrengthIndicator,
  QuestionEntityMenu,
} from "./QuestionActions.styled";

const HEADER_ICON_SIZE = 16;

const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
const MOVE_TESTID = "move-button";
const TURN_INTO_DATASET_TESTID = "turn-into-dataset";
const TOGGLE_MODEL_PERSISTENCE_TESTID = "toggle-persistence";
const CLONE_TESTID = "clone-button";
const ARCHIVE_TESTID = "archive-button";

const mapStateToProps = (state: State, props: Props) => ({
  isModerator: getUserIsAdmin(state),
});

const mapDispatchToProps = {
  softReloadCard,
};

interface Props {
  isBookmarked: boolean;
  isShowingQuestionInfoSidebar: boolean;
  handleBookmark: () => void;
  onOpenModal: (modalType: string) => void;
  question: Question;
  setQueryBuilderMode: (
    mode: string,
    opt: { datasetEditorTab: string },
  ) => void;
  turnDatasetIntoQuestion: () => void;
  turnQuestionIntoAction: () => void;
  turnActionIntoQuestion: () => void;
  onInfoClick: () => void;
  onModelPersistenceChange: () => void;
  isModerator: boolean;
  softReloadCard: () => void;
}

const QuestionActions = ({
  isBookmarked,
  isShowingQuestionInfoSidebar,
  handleBookmark,
  onOpenModal,
  question,
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
  turnQuestionIntoAction,
  turnActionIntoQuestion,
  onInfoClick,
  onModelPersistenceChange,
  isModerator,
  softReloadCard,
}: Props) => {
  const [animation, setAnimation] = useState<AnimationStates>(null);

  const handleClickBookmark = () => {
    handleBookmark();
    setAnimation(isBookmarked ? "shrink" : "expand");
  };
  const bookmarkButtonColor = isBookmarked ? color("brand") : undefined;
  const bookmarkTooltip = isBookmarked ? t`Remove from bookmarks` : t`Bookmark`;

  const infoButtonColor = isShowingQuestionInfoSidebar
    ? color("brand")
    : undefined;

  const isAction = question.isAction();
  const isDataset = question.isDataset();
  const canWrite = question.canWrite();
  const isSaved = question.isSaved();
  const isNative = question.isNative();

  const canPersistDataset =
    PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled() &&
    canWrite &&
    isSaved &&
    isDataset &&
    checkDatabaseCanPersistDatasets(question.query().database());

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
    onOpenModal(modal);
  }, [onOpenModal, question]);

  const extraButtons = [];

  extraButtons.push(
    PLUGIN_MODERATION.getMenuItems(question, isModerator, softReloadCard),
  );

  if (isDataset) {
    extraButtons.push(
      {
        title: t`Edit query definition`,
        icon: "notebook",
        action: handleEditQuery,
      },
      {
        title: (
          <div>
            {t`Edit metadata`} <StrengthIndicator dataset={question} />
          </div>
        ),
        icon: "label",
        action: handleEditMetadata,
      },
    );
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

  if (!isDataset) {
    extraButtons.push({
      title: t`Add to dashboard`,
      icon: "dashboard",
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
    if (!isDataset && !isAction) {
      extraButtons.push({
        title: t`Turn into a model`,
        icon: "model",
        action: handleTurnToModel,
        testId: TURN_INTO_DATASET_TESTID,
      });
    }
    if (isDataset) {
      extraButtons.push({
        title: t`Turn back to saved question`,
        icon: "model_framed",
        action: turnDatasetIntoQuestion,
      });
    }
    if (isSaved && isNative && !isDataset) {
      extraButtons.push({
        title: isAction
          ? t`Turn back to saved question`
          : t`Turn into an action`,
        icon: "bolt",
        action: isAction ? turnActionIntoQuestion : turnQuestionIntoAction,
      });
    }
    extraButtons.push({
      title: t`Duplicate`,
      icon: "segment",
      action: () => onOpenModal(MODAL_TYPES.CLONE),
      testId: CLONE_TESTID,
    });
    extraButtons.push({
      title: t`Archive`,
      icon: "view_archive",
      action: () => onOpenModal(MODAL_TYPES.ARCHIVE),
      testId: ARCHIVE_TESTID,
    });
  }

  return (
    <>
      <QuestionActionsDivider />
      <Tooltip tooltip={bookmarkTooltip}>
        <BookmarkButton
          animation={animation}
          isBookmarked={isBookmarked}
          onlyIcon
          icon="bookmark"
          iconSize={HEADER_ICON_SIZE}
          onClick={handleClickBookmark}
          color={bookmarkButtonColor}
        />
      </Tooltip>
      <Tooltip tooltip={t`More info`}>
        <Button
          onlyIcon
          icon="info"
          iconSize={HEADER_ICON_SIZE}
          onClick={onInfoClick}
          color={infoButtonColor}
          data-testId="qb-header-info-button"
        />
      </Tooltip>
      <QuestionEntityMenu
        items={extraButtons}
        triggerIcon="ellipsis"
        tooltip={t`Move, archive, and more...`}
      />
    </>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(QuestionActions);
