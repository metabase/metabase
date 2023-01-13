import React, { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";

import { useToggle } from "metabase/hooks/use-toggle";

import Actions from "metabase/entities/actions";
import ActionCreator from "metabase/actions/containers/ActionCreator";

import type { WritebackAction, WritebackActionId } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

import EmptyState from "../EmptyState.styled";
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

function mostRecentFirst(action: WritebackAction) {
  const createdAt = new Date(action["created_at"]);
  return -createdAt.getTime();
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

  const actionsSorted = useMemo(
    () => _.sortBy(actions, mostRecentFirst),
    [actions],
  );

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

  const hasImplicitActions = actions.some(action => action.type === "implicit");

  return (
    <Root>
      <ActionsHeader>
        {canWrite && (
          <>
            <Button onClick={showActionCreator}>{t`New action`}</Button>
            {!hasImplicitActions && (
              <ActionMenu
                triggerIcon="ellipsis"
                items={[
                  {
                    title: t`Create basic actions`,
                    icon: "bolt",
                    action: handleEnableImplicitActions,
                  },
                ]}
              />
            )}
          </>
        )}
      </ActionsHeader>
      {actions.length > 0 ? (
        <ActionList>
          {actionsSorted.map(action => (
            <li key={action.id}>
              <ModelActionListItem
                action={action}
                onEdit={canWrite ? () => handleEditAction(action) : undefined}
              />
            </li>
          ))}
        </ActionList>
      ) : (
        <EmptyState.Container>
          <EmptyState.Title>{t`No actions have been created yet.`}</EmptyState.Title>
          <EmptyState.Message>{t`Get started quickly with some basic actions to create, edit and delete, or create your own from scratch.`}</EmptyState.Message>
          {canWrite && (
            <EmptyState.ActionContainer>
              <Button
                icon="bolt"
                onClick={handleEnableImplicitActions}
              >{t`Create basic actions`}</Button>
            </EmptyState.ActionContainer>
          )}
        </EmptyState.Container>
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

export default _.compose(
  Actions.loadList({
    query: (state: State, { model }: OwnProps) => ({
      "model-id": model.id(),
    }),
  }),
  connect(null, mapDispatchToProps),
)(ModelActionDetails);
