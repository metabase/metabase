import React, { useState, useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { useToggle } from "metabase/hooks/use-toggle";

import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";

import Actions from "metabase/entities/actions";
import { ActionCreator } from "metabase/actions/components/ActionCreator";
import { hasImplicitActions, isImplicitAction } from "metabase/writeback/utils";

import type { WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

import {
  EmptyStateContainer,
  EmptyStateTitle,
} from "../ModelDetailPage.styled";
import { ActionListItem, ActionTitle } from "./ModelActionDetails.styled";

const mapDispatchToProps = {
  enableImplicitActionsForModel: Actions.actions.enableImplicitActionsForModel,
};

interface Props {
  model: Question;
  actions: WritebackAction[];
  enableImplicitActionsForModel: (modelId: number) => void;
}

function ModelActionDetails({
  actions,
  model,
  enableImplicitActionsForModel,
}: Props) {
  const [editingActionId, setEditingActionId] = useState<number | undefined>(
    undefined,
  );

  const [
    isActionCreatorOpen,
    { toggle: toggleIsActionCreatorVisible, turnOff: hideActionCreator },
  ] = useToggle();

  const closeModal = () => {
    hideActionCreator();
    setEditingActionId(undefined);
  };

  const handleCreateImplicitActions = async () => {
    await enableImplicitActionsForModel(model.id());
  };

  const handleItemClick = useCallback(
    (action: WritebackAction) => {
      if (!isImplicitAction(action)) {
        setEditingActionId(action.id);
        toggleIsActionCreatorVisible();
      }
    },
    [toggleIsActionCreatorVisible],
  );

  if (!actions?.length) {
    return (
      <EmptyStateContainer>
        <EmptyStateTitle>{t`This model does not have any actions yet.`}</EmptyStateTitle>
        <Button onClick={handleCreateImplicitActions} icon="add">
          {t`Enable implicit actions`}
        </Button>
        <AddActionButton onClick={toggleIsActionCreatorVisible} />
      </EmptyStateContainer>
    );
  }

  const modelHasImplicitActions = hasImplicitActions(actions);

  return (
    <>
      {!modelHasImplicitActions && model?.id() && (
        <Button onClick={handleCreateImplicitActions} icon="add">
          {t`Enable implicit actions`}
        </Button>
      )}
      <Button
        onClick={toggleIsActionCreatorVisible}
        icon="add"
      >{t`Create a new action`}</Button>
      <ul>
        {actions.map(action => (
          <li key={action.id}>
            <ActionListItem
              borderless
              disabled={isImplicitAction(action)}
              onClick={() => handleItemClick(action)}
            >
              <Icon name="insight" />
              <ActionTitle>{action.name}</ActionTitle>
            </ActionListItem>
          </li>
        ))}
      </ul>
      {isActionCreatorOpen && (
        <ActionCreator
          modelId={model.id()}
          databaseId={model.databaseId()}
          actionId={editingActionId}
          onClose={closeModal}
        />
      )}
    </>
  );
}

const AddActionButton = ({ onClick }: { onClick: () => void }) => (
  <Button
    onlyIcon
    onClick={onClick}
    icon="add"
  >{t`Create a new action`}</Button>
);

export default Actions.loadList(
  {
    query: (state: State, props: { model?: Question }) => ({
      "model-id": props?.model?.id(),
    }),
  },
  connect(null, mapDispatchToProps),
)(ModelActionDetails);
