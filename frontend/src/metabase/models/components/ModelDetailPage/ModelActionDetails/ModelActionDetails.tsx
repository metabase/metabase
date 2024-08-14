import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import Actions from "metabase/entities/actions";
import Databases from "metabase/entities/databases";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { parseTimestamp } from "metabase/lib/time";
import * as Urls from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";
import {
  canArchiveAction,
  canEditAction,
  canRunAction,
} from "metabase-lib/v1/actions/utils";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Card, WritebackAction } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import {
  EmptyStateContainer,
  EmptyStateTitle,
  EmptyStateMessage,
  EmptyStateActionContainer,
} from "../EmptyState.styled";

import {
  Root,
  ActionsHeader,
  ActionMenu,
  ActionList,
  ActionAlert,
} from "./ModelActionDetails.styled";
import ModelActionListItem from "./ModelActionListItem";

interface OwnProps {
  model: Question;
}

interface DispatchProps {
  onEnableImplicitActions: () => void;
  onArchiveAction: (action: WritebackAction) => void;
  onDeleteAction: (action: WritebackAction) => void;
}

interface ActionsLoaderProps {
  actions: WritebackAction[];
}

interface DatabaseLoaderProps {
  databases: Database[];
}

type Props = OwnProps &
  DispatchProps &
  ActionsLoaderProps &
  DatabaseLoaderProps;

function mapDispatchToProps(dispatch: Dispatch, { model }: OwnProps) {
  return {
    onEnableImplicitActions: () =>
      dispatch(Actions.actions.enableImplicitActionsForModel(model.id())),
    onArchiveAction: (action: WritebackAction) =>
      dispatch(Actions.objectActions.setArchived(action, true)),
    onDeleteAction: (action: WritebackAction) =>
      dispatch(Actions.actions.delete({ id: action.id })),
  };
}

function ModelActionDetails({
  model,
  actions,
  databases,
  onEnableImplicitActions,
  onArchiveAction,
  onDeleteAction,
}: Props) {
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
    () => actions.filter(action => action.type === "implicit"),
    [actions],
  );

  const onDeleteImplicitActions = useCallback(() => {
    askConfirmation({
      title: t`Disable basic actions?`,
      message: t`Disabling basic actions will also remove any buttons that use these actions. Are you sure you want to continue?`,
      confirmButtonText: t`Disable`,
      onConfirm: () => {
        implicitActions.forEach(action => {
          onDeleteAction(action);
        });
      },
    });
  }, [implicitActions, askConfirmation, onDeleteAction]);

  const menuItems = useMemo(() => {
    const items = [];
    const hasImplicitActions = implicitActions.length > 0;

    if (hasImplicitActions) {
      items.push({
        title: t`Disable basic actions`,
        icon: "bolt",
        action: onDeleteImplicitActions,
      });
    } else if (supportsImplicitActions) {
      items.push({
        title: t`Create basic actions`,
        icon: "bolt",
        action: onEnableImplicitActions,
      });
    }

    return items;
  }, [
    implicitActions,
    supportsImplicitActions,
    onEnableImplicitActions,
    onDeleteImplicitActions,
  ]);

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
    <Root>
      {canWrite && (
        <ActionsHeader data-testid="model-actions-header">
          <Button as={Link} to={newActionUrl}>{t`New action`}</Button>
          {menuItems.length > 0 && (
            <ActionMenu
              triggerIcon="ellipsis"
              items={menuItems}
              triggerProps={{ "aria-label": t`Actions menu` }}
            />
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
            icon="bolt"
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
export default _.compose(
  Actions.loadList({
    query: (state: State, { model }: OwnProps) => ({
      "model-id": model.id(),
    }),
  }),
  Databases.loadList(),
  connect(null, mapDispatchToProps),
)(ModelActionDetails);
