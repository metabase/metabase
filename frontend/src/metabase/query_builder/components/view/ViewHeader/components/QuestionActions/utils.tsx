import { t } from "ttag";

import type { DispatchFn } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  onOpenQuestionSettings,
  softReloadCard,
  turnModelIntoQuestion,
} from "metabase/query_builder/actions";
import { trackTurnIntoModelClicked } from "metabase/query_builder/analytics";
import { StrengthIndicator } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/QuestionActions.styled";
import { getEmbeddingActions } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/embedding-actions-utils";
import type { QuestionExtraActionConfig } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/types";
import { shouldShowQuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import {
  MODAL_TYPES,
  type QueryModalType,
} from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { checkCanBeModel } from "metabase-lib/v1/metadata/utils/models";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
const MOVE_TESTID = "move-button";
const TURN_INTO_DATASET_TESTID = "turn-into-dataset";
const CLONE_TESTID = "clone-button";
const ARCHIVE_TESTID = "archive-button";

export const getQuestionExtraActionsConfig = ({
  question,
  isAdmin,
  isPublicSharingEnabled,
  onOpenModal,
  dispatch,
  onSetQueryBuilderMode,
}: {
  question: Question;
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
  onOpenModal: (modalType: QueryModalType) => void;
  dispatch: DispatchFn;
  onSetQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
}) => {
  const isQuestion = question.type() === "question";
  const isModel = question.type() === "model";
  const isMetric = question.type() === "metric";
  const isModelOrMetric = isModel || isMetric;

  const hasCollectionPermissions = question.canWrite();
  const enableSettingsSidebar = shouldShowQuestionSettingsSidebar(question);

  const { isEditable: hasDataPermissions } = Lib.queryDisplayInfo(
    question.query(),
  );

  const reload = () => dispatch(softReloadCard());
  const onOpenSettingsSidebar = () => dispatch(onOpenQuestionSettings());

  const onTurnModelIntoQuestion = () => dispatch(turnModelIntoQuestion());

  const handleEditQuery = () =>
    onSetQueryBuilderMode("dataset", {
      datasetEditorTab: "query",
    });

  const handleEditMetadata = () =>
    onSetQueryBuilderMode("dataset", {
      datasetEditorTab: "metadata",
    });

  const handleTurnToModel = () => {
    const modal = checkCanBeModel(question)
      ? MODAL_TYPES.TURN_INTO_DATASET
      : MODAL_TYPES.CAN_NOT_CREATE_MODEL;
    trackTurnIntoModelClicked(question);
    onOpenModal(modal);
  };

  const menuItems: QuestionExtraActionConfig[] = [];

  if (isQuestion || isMetric) {
    menuItems.push({
      title: t`Add to dashboard`,
      icon: "add_to_dash",
      action: () => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD),
      testId: ADD_TO_DASH_TESTID,
    });
  }

  menuItems.push(...PLUGIN_MODERATION.useQuestionMenuItems(question, reload));

  if (hasCollectionPermissions) {
    if (isModelOrMetric && hasDataPermissions) {
      menuItems.push({
        title: isMetric ? t`Edit metric definition` : t`Edit query definition`,
        icon: "notebook",
        action: handleEditQuery,
      });
    }

    if (isModel) {
      menuItems.push({
        testId: "edit-metadata",
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
    if (isQuestion) {
      menuItems.push({
        title: t`Turn into a model`,
        icon: "model",
        action: handleTurnToModel,
        testId: TURN_INTO_DATASET_TESTID,
      });
    }
    if (isModel) {
      menuItems.push({
        title: t`Turn back to saved question`,
        icon: "insight",
        action: onTurnModelIntoQuestion,
      });
    }
  }

  if (enableSettingsSidebar) {
    menuItems.push({
      title: t`Edit settings`,
      icon: "gear",
      action: onOpenSettingsSidebar,
      testId: "question-settings-button",
    });
  }

  const embeddingMenuItems = getEmbeddingActions({
    question,
    isAdmin,
    isPublicSharingEnabled,
    onOpenModal,
  });

  if (embeddingMenuItems) {
    menuItems.push(...embeddingMenuItems);
  }

  if (hasCollectionPermissions) {
    menuItems.push({
      title: t`Move`,
      icon: "move",
      action: () => onOpenModal(MODAL_TYPES.MOVE),
      testId: MOVE_TESTID,
      withTopSeparator: true,
    });
  }

  if (hasDataPermissions) {
    menuItems.push({
      title: t`Duplicate`,
      icon: "clone",
      action: () => onOpenModal(MODAL_TYPES.CLONE),
      testId: CLONE_TESTID,
    });
  }

  if (hasCollectionPermissions) {
    menuItems.push({
      title: t`Move to trash`,
      icon: "trash",
      action: () => onOpenModal(MODAL_TYPES.ARCHIVE),
      testId: ARCHIVE_TESTID,
      withTopSeparator: true,
    });
  }

  return menuItems;
};
