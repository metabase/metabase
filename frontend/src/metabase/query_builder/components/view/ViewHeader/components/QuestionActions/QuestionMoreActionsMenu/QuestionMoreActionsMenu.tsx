import { Fragment, type JSX, useState } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  onOpenQuestionSettings,
  softReloadCard,
  turnModelIntoQuestion,
  turnQuestionIntoModel,
} from "metabase/query_builder/actions";
import { trackTurnIntoModelClicked } from "metabase/query_builder/analytics";
import { DatasetMetadataStrengthIndicator } from "metabase/query_builder/components/view/sidebars/DatasetManagementSection/DatasetMetadataStrengthIndicator";
import { shouldShowQuestionSettingsSidebar } from "metabase/query_builder/components/view/sidebars/QuestionSettingsSidebar";
import {
  MODAL_TYPES,
  type QueryModalType,
} from "metabase/query_builder/constants";
import { getQuestionWithoutComposing } from "metabase/query_builder/selectors";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import { Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { checkCanBeModel } from "metabase-lib/v1/metadata/utils/models";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

import QuestionActionsS from "./QuestionActions.module.css";
import { QuestionAlertsMenuItem } from "./QuestionAlertsMenuItem";

const ADD_TO_DASH_TESTID = "add-to-dashboard-button";
const MOVE_TESTID = "move-button";
const TURN_INTO_DATASET_TESTID = "turn-into-dataset";
const CLONE_TESTID = "clone-button";
const ARCHIVE_TESTID = "archive-button";

type QuestionMoreActionsMenuProps = {
  question: Question;
  onOpenModal: (modalType: QueryModalType) => void;
  onSetQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
};

export const QuestionMoreActionsMenu = ({
  question,
  onOpenModal,
  onSetQueryBuilderMode,
}: QuestionMoreActionsMenuProps): JSX.Element | null => {
  const [opened, setOpened] = useState(false);
  const underlyingQuestion = useSelector(getQuestionWithoutComposing);

  const dispatch = useDispatch();
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const isQuestion = question.type() === "question";
  const isModel = question.type() === "model";
  const isMetric = question.type() === "metric";
  const isModelOrMetric = isModel || isMetric;

  const isDashboardQuestion = isQuestion && _.isNumber(question.dashboardId());
  const isStandaloneQuestion =
    isQuestion && !_.isNumber(question.dashboardId());

  const collection = question.collection();
  const isAnalytics = collection && isInstanceAnalyticsCollection(collection);

  const hasCollectionPermissions = question.canWrite();
  const enableSettingsSidebar = shouldShowQuestionSettingsSidebar(question);

  const hasDataPermissions =
    underlyingQuestion != null &&
    Lib.queryDisplayInfo(underlyingQuestion.query()).isEditable;

  const reload = () => dispatch(softReloadCard());

  const handleEditQuery = () =>
    onSetQueryBuilderMode("dataset", {
      datasetEditorTab: "query",
    });

  const handleEditMetadata = () =>
    onSetQueryBuilderMode("dataset", {
      datasetEditorTab:
        isModel && question.display() === "list" ? "metadata" : "columns",
    });

  const [ackedModelModal] = useUserAcknowledgement("turn_into_model_modal");

  const handleTurnToModel = () => {
    if (!checkCanBeModel(question)) {
      onOpenModal(MODAL_TYPES.CAN_NOT_CREATE_MODEL);
    } else if (!ackedModelModal) {
      onOpenModal(MODAL_TYPES.TURN_INTO_DATASET);
    } else {
      dispatch(turnQuestionIntoModel());
    }
    trackTurnIntoModelClicked(question);
  };
  const onOpenSettingsSidebar = () => dispatch(onOpenQuestionSettings());

  const onTurnModelIntoQuestion = () => dispatch(turnModelIntoQuestion());

  const label = isDashboardQuestion
    ? t`Move, duplicate, and more…`
    : t`Move, trash, and more…`;

  const menuItems = [
    (isStandaloneQuestion || isMetric) && (
      <Menu.Item
        key="add_to_dash"
        leftSection={<Icon name="add_to_dash" />}
        onClick={() => onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD)}
        data-testid={ADD_TO_DASH_TESTID}
      >
        {t`Add to dashboard`}
      </Menu.Item>
    ),
    canManageSubscriptions && !isModel && !isAnalytics && (
      <QuestionAlertsMenuItem
        key="alerts"
        question={question}
        onClick={() => onOpenModal(MODAL_TYPES.CREATE_ALERT)}
      />
    ),
    ...PLUGIN_MODERATION.useCardMenuItems(question.card(), reload),
    hasCollectionPermissions && isModelOrMetric && hasDataPermissions && (
      <Menu.Item
        key="edit_definition"
        leftSection={<Icon name="notebook" />}
        onClick={handleEditQuery}
      >
        {isMetric ? t`Edit metric definition` : t`Edit query definition`}
      </Menu.Item>
    ),
    hasCollectionPermissions && isModel && (
      <Menu.Item
        key="edit-metadata"
        leftSection={<Icon name="label" />}
        data-testid="edit-metadata"
        onClick={handleEditMetadata}
      >
        <div>
          {t`Edit metadata`}{" "}
          <DatasetMetadataStrengthIndicator
            className={QuestionActionsS.StrengthIndicator}
            dataset={question}
          />
        </div>
      </Menu.Item>
    ),
    hasCollectionPermissions && !isDashboardQuestion && !isModel && (
      <Menu.Item
        key="turn_into_model"
        leftSection={<Icon name="model" />}
        data-testid={TURN_INTO_DATASET_TESTID}
        onClick={handleTurnToModel}
      >
        {t`Turn into a model`}
      </Menu.Item>
    ),
    hasCollectionPermissions && isModel && (
      <Menu.Item
        key="turn_into_question"
        leftSection={<Icon name="insight" />}
        onClick={onTurnModelIntoQuestion}
      >
        {t`Turn back to saved question`}
      </Menu.Item>
    ),
    enableSettingsSidebar && (
      <Menu.Item
        key="edit-settings"
        leftSection={<Icon name="gear" />}
        data-testid="question-settings-button"
        onClick={onOpenSettingsSidebar}
      >
        {t`Edit settings`}
      </Menu.Item>
    ),
    (hasCollectionPermissions || hasDataPermissions) && (
      <Menu.Divider key="divider" />
    ),
    hasCollectionPermissions && (
      <Menu.Item
        key="move"
        leftSection={<Icon name="move" />}
        data-testid={MOVE_TESTID}
        onClick={() => onOpenModal(MODAL_TYPES.MOVE)}
      >
        {c("A verb, not a noun").t`Move`}
      </Menu.Item>
    ),
    hasDataPermissions && (
      <Menu.Item
        key="duplicate"
        leftSection={<Icon name="clone" />}
        data-testid={CLONE_TESTID}
        onClick={() => onOpenModal(MODAL_TYPES.CLONE)}
      >
        {c("A verb, not a noun").t`Duplicate`}
      </Menu.Item>
    ),
    hasCollectionPermissions && (
      <Fragment key="trash">
        <Menu.Divider />
        <Menu.Item
          leftSection={<Icon name="trash" />}
          data-testid={ARCHIVE_TESTID}
          onClick={() => onOpenModal(MODAL_TYPES.ARCHIVE)}
        >
          {t`Move to trash`}
        </Menu.Item>
      </Fragment>
    ),
  ].filter(Boolean);

  useRegisterShortcut(
    hasCollectionPermissions
      ? [
          {
            id: "query-builder-send-to-trash",
            perform: () => onOpenModal(MODAL_TYPES.ARCHIVE),
          },
        ]
      : [],
  );

  if (!menuItems.length) {
    return null;
  }

  return (
    <Menu position="bottom-end" opened={opened} onChange={setOpened}>
      <Menu.Target>
        <div>
          <ToolbarButton
            icon="ellipsis"
            aria-label={label}
            tooltipLabel={label}
          />
        </div>
      </Menu.Target>

      <Menu.Dropdown>{menuItems}</Menu.Dropdown>
    </Menu>
  );
};
