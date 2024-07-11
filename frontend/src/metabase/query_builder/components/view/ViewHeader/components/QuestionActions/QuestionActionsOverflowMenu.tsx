import { useCallback } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";
import {
  OverflowMenu,
  type OverflowMenuItem,
} from "metabase/dashboard/components/DashboardHeader/buttons";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import {
  PLUGIN_MODEL_PERSISTENCE,
  PLUGIN_MODERATION,
  PLUGIN_QUERY_BUILDER_HEADER,
} from "metabase/plugins";
import {
  onModelPersistenceChange,
  setOpenQBModal,
  setQueryBuilderMode,
  softReloadCard,
  turnModelIntoQuestion,
} from "metabase/query_builder/actions";
import { trackTurnIntoModelClicked } from "metabase/query_builder/analytics";
import { StrengthIndicator } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/QuestionActions.styled";
import {
  MODAL_TYPES,
  type QueryModalType,
} from "metabase/query_builder/constants";
import { getQuestion } from "metabase/query_builder/selectors";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import {
  checkCanBeModel,
  checkDatabaseCanPersistDatasets,
} from "metabase-lib/v1/metadata/utils/models";
import type { QueryBuilderMode } from "metabase-types/store";

const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
const MOVE_TESTID = "move-button";
const TURN_INTO_DATASET_TESTID = "turn-into-dataset";
const TOGGLE_MODEL_PERSISTENCE_TESTID = "toggle-persistence";
const CLONE_TESTID = "clone-button";
const ARCHIVE_TESTID = "archive-button";
const useExtraButtons = ({ question }: { question: Question }) => {
  const dispatch = useDispatch();

  const isModerator = useSelector(getUserIsAdmin) && question?.canWrite?.();

  const dispatchSoftReloadCard = () => dispatch(softReloadCard());
  const handleModelPersistenceChange = () =>
    dispatch(onModelPersistenceChange());

  const isMetabotEnabled = useSetting("is-metabot-enabled");

  const isModel = question.type() === "model";
  const isQuestion = question.type() === "question";
  const isMetric = question.type() === "metric";
  const isModelOrMetric = isModel || isMetric;

  const hasCollectionPermissions = question.canWrite();
  const isSaved = question.isSaved();

  const database = question.database();

  const { isEditable: hasDataPermissions } = Lib.queryDisplayInfo(
    question.query(),
  );
  const onTurnModelIntoQuestion = () => dispatch(turnModelIntoQuestion());

  const onOpenModal = useCallback(
    (modal: QueryModalType) => dispatch(setOpenQBModal(modal)),
    [dispatch],
  );

  const onSetQueryBuilderMode = useCallback(
    (
      queryBuilderMode: QueryBuilderMode,
      { shouldUpdateUrl = true, datasetEditorTab = "query" } = {},
    ) =>
      dispatch(
        setQueryBuilderMode(queryBuilderMode, {
          shouldUpdateUrl,
          datasetEditorTab,
        }),
      ),
    [dispatch],
  );

  const canPersistDataset =
    PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled() &&
    hasCollectionPermissions &&
    isSaved &&
    isModel &&
    checkDatabaseCanPersistDatasets(question.database());

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

  const extraButtons: OverflowMenuItem[] = [];

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

  if (canPersistDataset) {
    extraButtons.push({
      ...PLUGIN_MODEL_PERSISTENCE.getMenuItems(
        question,
        handleModelPersistenceChange,
      ),
      testId: TOGGLE_MODEL_PERSISTENCE_TESTID,
    });
  }

  if (isQuestion || isMetric) {
    extraButtons.push({
      title: t`Add to dashboard`,
      icon: "add_to_dash",
      action: () => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD),
      testId: ADD_TO_DASH_TESTID,
    });
  }

  if (hasCollectionPermissions) {
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
        action: onTurnModelIntoQuestion,
      });
    }
  }

  extraButtons.push(...PLUGIN_QUERY_BUILDER_HEADER.extraButtons(question));

  if (hasCollectionPermissions) {
    extraButtons.push({
      title: t`Move to trash`,
      icon: "trash",
      action: () => onOpenModal(MODAL_TYPES.ARCHIVE),
      testId: ARCHIVE_TESTID,
    });
  }
  return extraButtons;
};

const QuestionActionsOverflowMenu = ({ question }: { question: Question }) => {
  const extraButtons = useExtraButtons({ question });

  if (extraButtons.length === 0) {
    return null;
  }
  return (
    <OverflowMenu
      items={extraButtons}
      target={
        <Box>
          <EntityMenuTrigger
            ariaLabel={t`Move, trash, and more...`}
            icon="ellipsis"
            tooltip={t`Move, trash, and more...`}
          />
        </Box>
      }
    ></OverflowMenu>
  );
};
export const QuestionActionsOverflowMenuWrapper = () => {
  const question = useSelector(getQuestion);
  return question && question.isArchived() ? (
    <QuestionActionsOverflowMenu question={question} />
  ) : null;
};
