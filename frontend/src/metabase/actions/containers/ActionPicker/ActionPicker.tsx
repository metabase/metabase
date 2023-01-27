import React, { useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { useToggle } from "metabase/hooks/use-toggle";

import Actions from "metabase/entities/actions";
import Questions from "metabase/entities/questions";
import Search from "metabase/entities/search";

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

function mapProps(props: { models: Card[] }) {
  console.log("mapStateToProps", props);
  return {
    ...props,
    modeIds: props.models.map((model: Card) => model.id),
  };
}

export default function ActionPicker({
  models,
  onClick,
  currentAction,
}: {
  models: Card[];
  onClick: (action: WritebackAction) => void;
  currentAction?: WritebackAction;
}) {
  const modelIds = models?.map(model => model.id) ?? [];

  return (
    <div className="scroll-y">
      {modelIds.map(modelId => (
        <ConnectedModelActionPicker
          key={modelId}
          modelId={modelId}
          onClick={onClick}
          currentAction={currentAction}
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
    loadingAndErrorWrapper: false,
  }),
  Actions.loadList({
    query: (state: State, props: { modelId?: number | null }) => ({
      "model-id": props?.modelId,
    }),
    loadingAndErrorWrapper: false,
  }),
)(ModelActionPicker);

export const ConnectedActionPicker = Search.loadList({
  query: () => ({
    models: ["dataset"],
  }),
  loadingAndErrorWrapper: false,
  listName: "models",
})(ActionPicker);
