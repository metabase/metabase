import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import { useToggle } from "metabase/hooks/use-toggle";

import Actions from "metabase/entities/actions";
import ActionCreator from "metabase/actions/containers/ActionCreator";

import type { WritebackAction } from "metabase-types/api";
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
  const [
    isActionCreatorOpen,
    { turnOn: showActionCreator, turnOff: hideActionCreator },
  ] = useToggle();

  return (
    <>
      <ActionsHeader>
        <Button onClick={showActionCreator}>{t`New action`}</Button>
      </ActionsHeader>
      <ActionList>
        {actions.map(action => (
          <li key={action.id}>
            <ModelActionListItem action={action} />
          </li>
        ))}
      </ActionList>
      {isActionCreatorOpen && (
        <ActionCreator
          modelId={model.id()}
          databaseId={model.databaseId()}
          onClose={hideActionCreator}
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
