import type { MouseEvent } from "react";
import { useState, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ActionCreator from "metabase/actions/containers/ActionCreator";
import Modal from "metabase/components/Modal";
import CS from "metabase/css/core/index.css";
import Actions from "metabase/entities/actions";
import Search from "metabase/entities/search";
import { useToggle } from "metabase/hooks/use-toggle";
import type { Card, WritebackAction } from "metabase-types/api";

import {
  ActionsList,
  ActionItem,
  EditButton,
  EmptyState,
  ModelCollapseSection,
  EmptyModelStateContainer,
  NewActionButton,
} from "./ActionPicker.styled";
import { sortAndGroupActions } from "./utils";

export function ActionPicker({
  models,
  actions,
  onClick,
  currentAction,
}: {
  models: Card[];
  actions: WritebackAction[];
  onClick: (action: WritebackAction) => void;
  currentAction?: WritebackAction;
}) {
  const sortedModels =
    useMemo(
      () => models?.sort((a, b) => a.name.localeCompare(b.name)),
      [models],
    ) ?? [];

  const actionsByModel = useMemo(() => sortAndGroupActions(actions), [actions]);

  return (
    <div className={CS.scrollY}>
      {sortedModels.map(model => (
        <ModelActionPicker
          key={model.id}
          model={model}
          actions={actionsByModel[model.id] ?? []}
          onClick={onClick}
          currentAction={currentAction}
        />
      ))}
      {!sortedModels.length && (
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

  const handleModalSubmit = (updatedAction: WritebackAction) => {
    onClick(updatedAction);
  };

  return (
    <>
      <ModelCollapseSection
        header={<h4>{model.name}</h4>}
        initialState={hasCurrentAction ? "expanded" : "collapsed"}
      >
        {actions.length ? (
          <ActionsList>
            {actions.map(action => (
              <ActionItem
                key={action.id}
                role="button"
                isSelected={currentAction?.id === action.id}
                aria-selected={currentAction?.id === action.id}
                onClick={() => onClick(action)}
                data-testid={`action-item-${action.name}`}
              >
                <span>{action.name}</span>
                <EditButton
                  icon="pencil"
                  onlyIcon
                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                    // we have a click listener on the parent
                    event.stopPropagation();

                    setEditingActionId(action.id);
                    toggleIsActionCreatorVisible();
                  }}
                />
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
        <Modal wide onClose={closeModal} closeOnClickOutside>
          <ActionCreator
            modelId={model.id}
            databaseId={model.database_id}
            actionId={editingActionId}
            onClose={closeModal}
            onSubmit={handleModalSubmit}
          />
        </Modal>
      )}
    </>
  );
}

export const ConnectedActionPicker = _.compose(
  Search.loadList({
    query: () => ({
      models: ["dataset"],
    }),
    listName: "models",
  }),
  Actions.loadList({
    loadingAndErrorWrapper: false,
  }),
)(ActionPicker);
