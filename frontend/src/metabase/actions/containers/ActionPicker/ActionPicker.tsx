import React, { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useToggle } from "metabase/hooks/use-toggle";

import Actions from "metabase/entities/actions";
import Questions from "metabase/entities/questions";

import type { Card, WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import Button from "metabase/core/components/Button";

import { isImplicitAction } from "metabase/actions/utils";
import ActionCreator from "metabase/actions/containers/ActionCreator";

import {
  ActionItem,
  EditButton,
  EmptyState,
  ModelCollapseSection,
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
      <ModelCollapseSection header={<h4>{model.name}</h4>}>
        {actions?.length ? (
          <ul>
            {actions?.map(action => (
              <ActionItem key={action.id}>
                <Button onlyText onClick={() => onClick(action)}>
                  <span>{action.name}</span>
                </Button>
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
            <ActionItem>
              <Button onlyText onClick={toggleIsActionCreatorVisible}>
                {t`Create new action`}
              </Button>
            </ActionItem>
          </ul>
        ) : (
          <EmptyModelStateContainer>
            <div>{t`There are no actions for this model`}</div>
            <Button onClick={toggleIsActionCreatorVisible} borderless>
              {t`Create new action`}
            </Button>
          </EmptyModelStateContainer>
        )}
      </ModelCollapseSection>
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
