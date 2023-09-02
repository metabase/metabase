import { useCallback } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import EntityMenu from "metabase/components/EntityMenu";

import { PLUGIN_MODERATION, PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";

import { MODAL_TYPES } from "metabase/query_builder/constants";

import { softReloadCard } from "metabase/query_builder/actions";
import { getUserIsAdmin } from "metabase/selectors/user";

import { color } from "metabase/lib/colors";

import BookmarkToggle from "metabase/core/components/BookmarkToggle";
import { getSetting } from "metabase/selectors/settings";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { trackTurnIntoModelClicked } from "metabase/query_builder/analytics";
import Question from "metabase-lib/Question";

import {
  checkCanBeModel,
  checkDatabaseCanPersistDatasets,
} from "metabase-lib/metadata/utils/models";
import {
  QuestionActionsDivider,
  StrengthIndicator,
} from "./QuestionActions.styled";
import { ViewHeaderIconButtonContainer } from "./view/ViewHeader.styled";

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
  onOpenModal: (modalType: string) => void;
  question: Question;
  setQueryBuilderMode: (
    mode: string,
    opt: { datasetEditorTab: string },
  ) => void;
  turnDatasetIntoQuestion: () => void;
  onInfoClick: () => void;
  onModelPersistenceChange: () => void;
}

const QuestionActions = ({
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
  const isMetabotEnabled = useSelector(state =>
    getSetting(state, "is-metabot-enabled"),
  );
  const isModerator = useSelector(getUserIsAdmin);

  const dispatch = useDispatch();

  const dispatchSoftReloadCard = () => dispatch(softReloadCard());

  const infoButtonColor = isShowingQuestionInfoSidebar
    ? color("brand")
    : undefined;

  const isDataset = question.isDataset();
  const canWrite = question.canWrite();
  const isSaved = question.isSaved();
  const database = question.database();

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
    trackTurnIntoModelClicked(question);
    onOpenModal(modal);
  }, [onOpenModal, question]);

  const extraButtons = [];

  if (
    isMetabotEnabled &&
    isDataset &&
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

  if (canWrite && isDataset) {
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
    if (!isDataset) {
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
        icon: "insight",
        action: turnDatasetIntoQuestion,
      });
    }
  }

  if (!question.query().readOnly()) {
    extraButtons.push({
      title: t`Duplicate`,
      icon: "clone",
      action: () => onOpenModal(MODAL_TYPES.CLONE),
      testId: CLONE_TESTID,
    });
  }

  if (canWrite) {
    extraButtons.push({
      title: t`Archive`,
      icon: "archive",
      action: () => onOpenModal(MODAL_TYPES.ARCHIVE),
      testId: ARCHIVE_TESTID,
    });
  }

  return (
    <>
      <QuestionActionsDivider />
      <ViewHeaderIconButtonContainer>
        <BookmarkToggle
          onCreateBookmark={handleBookmark}
          onDeleteBookmark={handleBookmark}
          isBookmarked={isBookmarked}
        />
      </ViewHeaderIconButtonContainer>
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
      {extraButtons.length > 0 && (
        <EntityMenu
          triggerAriaLabel={t`Move, archive, and more...`}
          items={extraButtons}
          triggerIcon="ellipsis"
          tooltip={t`Move, archive, and more...`}
        />
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionActions;
