import React, { useState } from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import { useToggle } from "metabase/hooks/use-toggle";

import Actions from "metabase/entities/actions";
import Search from "metabase/entities/search";

import { isImplicitAction } from "metabase/actions/utils";
import ActionCreator from "metabase/actions/containers/ActionCreator";

import type { Card, WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  ActionsList,
  ActionItem,
  EditButton,
  EmptyState,
  ModelCollapseSection,
  EmptyModelStateContainer,
  NewActionButton,
} from "./ActionPicker.styled";

export default function ActionPicker({
  models,
  onClick,
  currentAction,
}: {
  models: Card[];
  onClick: (action: WritebackAction) => void;
  currentAction?: WritebackAction;
}) {
  return (
    <div className="scroll-y">
      {models.map(model => (
        <ConnectedModelActionPicker
          key={model.id}
          model={model}
          onClick={onClick}
          currentAction={currentAction}
        />
      ))}
      {!models.length && (
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
  currentAction,
}: {
  onClick: (newValue: WritebackAction) => void;
  model: Card;
  actions: WritebackAction[];
  currentAction?: WritebackAction;
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

  const hasCurrentAction = currentAction?.model_id === model.id;

  return (
    <>
      <ModelCollapseSection
        header={<h4>{model.name}</h4>}
        initialState={hasCurrentAction ? "expanded" : "collapsed"}
      >
        {actions?.length ? (
          <ActionsList>
            {actions?.map(action => (
              <ActionItem
                key={action.id}
                role="button"
                isSelected={currentAction?.id === action.id}
                aria-selected={currentAction?.id === action.id}
                onClick={() => onClick(action)}
              >
                <span>{action.name}</span>
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
            <NewActionButton onlyText onClick={toggleIsActionCreatorVisible}>
              {t`Create new action`}
            </NewActionButton>
          </ActionsList>
        ) : (
          <EmptyModelStateContainer>
            <div>{t`There are no actions for this model`}</div>
            <NewActionButton onlyText onClick={toggleIsActionCreatorVisible}>
              {t`Create new action`}
            </NewActionButton>
          </EmptyModelStateContainer>
        )}
      </ModelCollapseSection>
      {isActionCreatorOpen && (
        <Modal wide onClose={closeModal}>
          <ActionCreator
            modelId={model.id}
            databaseId={model.database_id}
            actionId={editingActionId}
            onClose={closeModal}
          />
        </Modal>
      )}
    </>
  );
}

const ConnectedModelActionPicker = Actions.loadList({
  query: (state: State, props: { model: { id: number | null } }) => ({
    "model-id": props?.model?.id,
  }),
  loadingAndErrorWrapper: false,
})(ModelActionPicker);

export const ConnectedActionPicker = Search.loadList({
  query: () => ({
    models: ["dataset"],
  }),
  loadingAndErrorWrapper: true,
  listName: "models",
})(ActionPicker);
