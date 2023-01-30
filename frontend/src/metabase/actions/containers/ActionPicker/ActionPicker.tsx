import React, { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useToggle } from "metabase/hooks/use-toggle";

import Actions from "metabase/entities/actions";
import Questions from "metabase/entities/questions";

import type { Card, WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";

import { isImplicitAction } from "metabase/actions/utils";
import ActionCreator from "metabase/actions/containers/ActionCreator";

import {
  ModelTitle,
  ActionItem,
  ActionName,
  EditButton,
  ModelActionList,
  EmptyState,
  EmptyModelStateContainer,
} from "./ActionPicker.styled";

export default function ActionPicker({
  modelIds,
  onClick,
}: {
  modelIds: number[];
  onClick: (action: WritebackAction) => void;
}) {
  return (
    <div className="scroll-y">
      {modelIds.map(modelId => (
        <ConnectedModelActionPicker
          key={modelId}
          modelId={modelId}
          onClick={onClick}
        />
      ))}
      {!modelIds.length && (
        <EmptyState
          message={t`No models found`}
          action={t`Create new model`}
          link={"/model/new"}
        />
      )}
    </div>
  );
}

function ModelActionPicker({
  onClick,
  model,
  actions,
}: {
  onClick: (newValue: WritebackAction) => void;
  model: Card;
  actions: WritebackAction[];
}) {
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

  return (
    <>
      <ModelActionList>
        <ModelTitle>
          <div>
            <Icon name="model" size={16} className="mr2" />
            {model.name}
          </div>
          <Button onlyIcon icon="add" onClick={toggleIsActionCreatorVisible} />
        </ModelTitle>
        {actions?.length ? (
          <ul>
            {actions?.map(action => (
              <ActionItem key={action.id}>
                <ActionName onClick={() => onClick(action)}>
                  {action.name}
                </ActionName>
                {!isImplicitAction(action) && (
                  <EditButton
                    icon="pencil"
                    onlyIcon
                    onClick={() => {
                      setEditingActionId(action.id);
                      toggleIsActionCreatorVisible();
                    }}
                  />
                )}
              </ActionItem>
            ))}
          </ul>
        ) : (
          <EmptyModelStateContainer>
            <div>{t`There are no actions for this model`}</div>
            <Button onClick={toggleIsActionCreatorVisible} borderless>
              {t`Create new action`}
            </Button>
          </EmptyModelStateContainer>
        )}
      </ModelActionList>
      {isActionCreatorOpen && (
        <ActionCreator
          modelId={model.id}
          databaseId={model.database_id}
          actionId={editingActionId}
          onClose={closeModal}
        />
      )}
    </>
  );
}

const ConnectedModelActionPicker = _.compose(
  Questions.load({
    id: (state: State, props: { modelId?: number | null }) => props?.modelId,
    entityAlias: "model",
  }),
  Actions.loadList({
    query: (state: State, props: { modelId?: number | null }) => ({
      "model-id": props?.modelId,
    }),
  }),
)(ModelActionPicker);
