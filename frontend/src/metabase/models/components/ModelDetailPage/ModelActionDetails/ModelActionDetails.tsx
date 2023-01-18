import React, { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";

import Actions from "metabase/entities/actions";
import { useToggle } from "metabase/hooks/use-toggle";
import { parseTimestamp } from "metabase/lib/time";

import ActionCreator from "metabase/actions/containers/ActionCreator";

import type { WritebackAction, WritebackActionId } from "metabase-types/api";
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
} from "./ModelActionDetails.styled";

interface OwnProps {
  model: Question;
}

interface DispatchProps {
  handleEnableImplicitActions: () => void;
}

interface ActionsLoaderProps {
  actions: WritebackAction[];
}

type Props = OwnProps & DispatchProps & ActionsLoaderProps;

function mapDispatchToProps(dispatch: Dispatch, { model }: OwnProps) {
  return {
    handleEnableImplicitActions: () =>
      dispatch(Actions.actions.enableImplicitActionsForModel(model.id())),
  };
}

function ModelActionDetails({
  model,
  actions,
  handleEnableImplicitActions,
}: Props) {
  const [editingActionId, setEditingActionId] = useState<
    WritebackActionId | undefined
  >(undefined);

  const [
    isActionCreatorOpen,
    { turnOn: showActionCreator, turnOff: hideActionCreator },
  ] = useToggle();

  const canWrite = model.canWrite();
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
        action: handleEnableImplicitActions,
      },
    ];
  }, [handleEnableImplicitActions]);

  const handleEditAction = useCallback(
    (action: WritebackAction) => {
      setEditingActionId(action.id);
      showActionCreator();
    },
    [showActionCreator],
  );

  const handleCloseActionCreator = useCallback(() => {
    hideActionCreator();
    setEditingActionId(undefined);
  }, [hideActionCreator]);

  const renderActionListItem = useCallback(
    (action: WritebackAction) => {
      const onEdit = canWrite ? () => handleEditAction(action) : undefined;
      return (
        <li key={action.id} aria-label={action.name}>
          <ModelActionListItem action={action} onEdit={onEdit} />
        </li>
      );
    },
    [canWrite, handleEditAction],
  );

  return (
    <Root>
      {canWrite && (
        <ActionsHeader>
          <Button onClick={showActionCreator}>{t`New action`}</Button>
          {!hasImplicitActions && (
            <ActionMenu
              triggerIcon="ellipsis"
              items={menuItems}
              triggerProps={ACTION_MENU_TRIGGER_PROPS}
            />
          )}
        </ActionsHeader>
      )}
      {actions.length > 0 ? (
        <ActionList aria-label={t`Action list`}>
          {actionsSorted.map(renderActionListItem)}
        </ActionList>
      ) : (
        <NoActionsState
          hasCreateButton={canWrite}
          onCreateClick={handleEnableImplicitActions}
        />
      )}
      {isActionCreatorOpen && (
        <ActionCreator
          modelId={model.id()}
          databaseId={model.databaseId()}
          actionId={editingActionId}
          onClose={handleCloseActionCreator}
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
