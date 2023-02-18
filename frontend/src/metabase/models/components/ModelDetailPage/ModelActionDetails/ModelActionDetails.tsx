import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";

import Actions from "metabase/entities/actions";
import { parseTimestamp } from "metabase/lib/time";
import * as Urls from "metabase/lib/urls";

import type { Card, WritebackAction } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

import {
  EmptyStateContainer,
  EmptyStateTitle,
  EmptyStateMessage,
  EmptyStateActionContainer,
} from "../EmptyState.styled";
import ModelActionListItem from "./ModelActionListItem";
import {
  Root,
  ActionsHeader,
  ActionMenu,
  ActionList,
  ActionAlert,
} from "./ModelActionDetails.styled";

interface OwnProps {
  model: Question;
}

interface DispatchProps {
  onEnableImplicitActions: () => void;
  onArchiveAction: (action: WritebackAction) => void;
}

interface ActionsLoaderProps {
  actions: WritebackAction[];
}

type Props = OwnProps & DispatchProps & ActionsLoaderProps;

function mapDispatchToProps(dispatch: Dispatch, { model }: OwnProps) {
  return {
    onEnableImplicitActions: () =>
      dispatch(Actions.actions.enableImplicitActionsForModel(model.id())),
    onArchiveAction: (action: WritebackAction) =>
      dispatch(Actions.objectActions.setArchived(action, true)),
  };
}

function ModelActionDetails({
  model,
  actions,
  onEnableImplicitActions,
  onArchiveAction,
}: Props) {
  const database = model.database();
  const hasActionsEnabled = database != null && database.hasActionsEnabled();
  const canWrite = model.canWriteActions();
  const hasImplicitActions = actions.some(action => action.type === "implicit");

  const actionsSorted = useMemo(
    () => _.sortBy(actions, mostRecentFirst),
    [actions],
  );

  const menuItems = useMemo(() => {
    return [
      {
        title: t`Create basic actions`,
        icon: "bolt",
        action: onEnableImplicitActions,
      },
    ];
  }, [onEnableImplicitActions]);

  const renderActionListItem = useCallback(
    (action: WritebackAction) => {
      const actionUrl = Urls.action(model.card() as Card, action.id);

      return (
        <li key={action.id} aria-label={action.name}>
          <ModelActionListItem
            action={action}
            actionUrl={actionUrl}
            canWrite={canWrite}
            onArchive={onArchiveAction}
          />
        </li>
      );
    },
    [model, canWrite, onArchiveAction],
  );

  const newActionUrl = Urls.newAction(model.card() as Card);

  return (
    <Root>
      {canWrite && (
        <ActionsHeader>
          <Button as={Link} to={newActionUrl}>{t`New action`}</Button>
          {!hasImplicitActions && (
            <ActionMenu
              triggerIcon="ellipsis"
              items={menuItems}
              triggerProps={ACTION_MENU_TRIGGER_PROPS}
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
          hasCreateButton={canWrite}
          onCreateClick={onEnableImplicitActions}
        />
      )}
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
  return -createdAt.unix();
}

const ACTION_MENU_TRIGGER_PROPS = {
  "data-testid": "new-action-menu",
};

export default _.compose(
  Actions.loadList({
    query: (state: State, { model }: OwnProps) => ({
      "model-id": model.id(),
    }),
  }),
  connect(null, mapDispatchToProps),
)(ModelActionDetails);
