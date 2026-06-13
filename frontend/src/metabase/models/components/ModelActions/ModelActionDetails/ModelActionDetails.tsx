import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useDeleteActionMutation,
  useListActionsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { Link } from "metabase/common/components/Link";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Button, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import type Question from "metabase-lib/v1/Question";
import {
  canArchiveAction,
  canEditAction,
  canRunAction,
} from "metabase-lib/v1/actions/utils";
import type { Card, WritebackAction } from "metabase-types/api";

import {
  EmptyStateActionContainer,
  EmptyStateContainer,
  EmptyStateMessage,
  EmptyStateTitle,
} from "../EmptyState.styled";

import {
  ActionAlert,
  ActionList,
  ActionsHeader,
  Root,
} from "./ModelActionDetails.styled";
import ModelActionListItem from "./ModelActionListItem";
import { useEnableImplicitActionsForModel } from "./useEnableImplicitActionsForModel";

interface OwnProps {
  model: Question;
}

type Props = OwnProps;

function ModelActionDetails({ model }: Props) {
  useListDatabasesQuery();
  const databases = useSelector((state) => getMetadata(state).databasesList());
  const { data: actions = [] } = useListActionsQuery({
    "model-id": model.id(),
  });
  const [deleteAction] = useDeleteActionMutation();
  const onEnableImplicitActions = useEnableImplicitActionsForModel(model.id());
  const onDeleteAction = useCallback(
    (action: WritebackAction) => deleteAction(action.id),
    [deleteAction],
  );
  const archive = useSetArchive();
  const onArchiveAction = useCallback(
    (action: WritebackAction) =>
      archive({ id: action.id, model: "action" }, true),
    [archive],
  );
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const database = model.database();
  const hasActionsEnabled = database != null && database.hasActionsEnabled();
  const canWrite = model.canWriteActions();
  const supportsImplicitActions = model.supportsImplicitActions();

  const actionsSorted = useMemo(
    () => _.sortBy(actions, mostRecentFirst),
    [actions],
  );

  const implicitActions = useMemo(
    () => actions.filter((action) => action.type === "implicit"),
    [actions],
  );

  const onDeleteImplicitActions = useCallback(() => {
    askConfirmation({
      title: t`Disable basic actions?`,
      message: t`Disabling basic actions will also remove any buttons that use these actions. Are you sure you want to continue?`,
      confirmButtonText: t`Disable`,
      onConfirm: () => {
        implicitActions.forEach((action) => {
          onDeleteAction(action);
        });
      },
    });
  }, [implicitActions, askConfirmation, onDeleteAction]);

  const hasImplicitActions = implicitActions.length > 0;
  const hasActionsMenu = hasImplicitActions || supportsImplicitActions;

  const renderActionListItem = useCallback(
    (action: WritebackAction) => {
      const actionUrl = Urls.action(model.card() as Card, action.id);

      return (
        <li key={action.id} aria-label={action.name}>
          <ModelActionListItem
            action={action}
            actionUrl={actionUrl}
            canRun={canRunAction(action, databases)}
            canEdit={canEditAction(action, model)}
            canArchive={canArchiveAction(action, model)}
            onArchive={onArchiveAction}
          />
        </li>
      );
    },
    [model, databases, onArchiveAction],
  );

  const newActionUrl = Urls.newAction(model.card() as Card);

  return (
    <Root data-testid="model-action-details">
      {canWrite && (
        <ActionsHeader data-testid="model-actions-header">
          <Button component={Link} to={newActionUrl}>{t`New action`}</Button>
          {hasActionsMenu && (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon aria-label={t`Actions`} variant="subtle" ml="sm">
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {hasImplicitActions ? (
                  <Menu.Item
                    leftSection={<Icon name="bolt" aria-hidden />}
                    onClick={onDeleteImplicitActions}
                  >
                    {t`Disable basic actions`}
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    leftSection={<Icon name="bolt" aria-hidden />}
                    onClick={onEnableImplicitActions}
                  >
                    {t`Create basic actions`}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </ActionsHeader>
      )}
      {database && !hasActionsEnabled && (
        <ActionAlert icon="warning" variant="error">
          {t`Running Actions is not enabled for database ${database.displayName()}`}
        </ActionAlert>
      )}
      {actions.length > 0 ? (
        <ActionList aria-label={t`Action list`}>
          {actionsSorted.map(renderActionListItem)}
        </ActionList>
      ) : (
        <NoActionsState
          hasCreateButton={canWrite && supportsImplicitActions}
          onCreateClick={onEnableImplicitActions}
        />
      )}
      {confirmationModal}
    </Root>
  );
}

function NoActionsState({
  hasCreateButton,
  onCreateClick,
}: {
  hasCreateButton: boolean;
  onCreateClick: () => void;
}) {
  return (
    <EmptyStateContainer>
      <EmptyStateTitle>{t`No actions have been created yet.`}</EmptyStateTitle>
      <EmptyStateMessage>{t`Get started quickly with some basic actions to create, edit and delete, or create your own from scratch.`}</EmptyStateMessage>
      {hasCreateButton && (
        <EmptyStateActionContainer>
          <Button
            leftSection={<Icon name="bolt" />}
            onClick={onCreateClick}
          >{t`Create basic actions`}</Button>
        </EmptyStateActionContainer>
      )}
    </EmptyStateContainer>
  );
}

function mostRecentFirst(action: WritebackAction) {
  const createdAt = parseTimestamp(action["created_at"]);
  return -createdAt.valueOf();
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelActionDetails;
