import React, { useCallback, useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import { useToggle } from "metabase/hooks/use-toggle";

import Actions from "metabase/entities/actions";
import ActionCreator from "metabase/actions/containers/ActionCreator";

import type { WritebackAction, WritebackActionId } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

import ModelActionListItem from "./ModelActionListItem";
import { ActionsHeader, ActionList } from "./ModelActionDetails.styled";

interface OwnProps {
  model: Question;
}

interface ActionsLoaderProps {
  actions: WritebackAction[];
}

type Props = OwnProps & ActionsLoaderProps;

function ModelActionDetails({ model, actions }: Props) {
  const [editingActionId, setEditingActionId] = useState<
    WritebackActionId | undefined
  >(undefined);

  const [
    isActionCreatorOpen,
    { turnOn: showActionCreator, turnOff: hideActionCreator },
  ] = useToggle();

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

  return (
    <>
      <ActionsHeader>
        <Button onClick={showActionCreator}>{t`New action`}</Button>
      </ActionsHeader>
      <ActionList>
        {actions.map(action => (
          <li key={action.id}>
            <ModelActionListItem
              action={action}
              onEdit={() => handleEditAction(action)}
            />
          </li>
        ))}
      </ActionList>
      {isActionCreatorOpen && (
        <ActionCreator
          modelId={model.id()}
          databaseId={model.databaseId()}
          actionId={editingActionId}
          onClose={handleCloseActionCreator}
        />
      )}
    </>
  );
}

export default Actions.loadList({
  query: (state: State, { model }: OwnProps) => ({
    "model-id": model.id(),
  }),
})(ModelActionDetails);
