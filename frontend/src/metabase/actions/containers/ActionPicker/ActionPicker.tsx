import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
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
  ActionItem,
  ActionsList,
  EditButton,
  EmptyModelStateContainer,
  EmptyState,
  NewActionButton,
} from "./ActionPicker.styled";
import { sortAndGroupActions, sortAndGroupTableActions } from "./utils";
import { Divider, Stack, Text, Title } from "metabase/ui";
import CollapseSection from "metabase/components/CollapseSection";

export function ActionPicker({
  models,
  actions: modelActions,
  editableActions = [],
  onClick,
  currentAction,
}: {
  models: Card[];
  actions: WritebackAction[];
  editableActions?: WritebackAction[];
  onClick: (action: WritebackAction) => void;
  currentAction?: WritebackAction;
}) {
  const sortedModels =
    useMemo(
      () => models?.sort((a, b) => a.name.localeCompare(b.name)),
      [models],
    ) ?? [];

  const actionsByModel = useMemo(
    () => sortAndGroupActions(modelActions),
    [modelActions],
  );

  const actionsByTable = useMemo(
    () => sortAndGroupTableActions(editableActions),
    [editableActions],
  );

  const hasTwoActionGroups =
    sortedModels.length > 0 && editableActions?.length > 0;

  return (
    <Stack gap="md" className={CS.scrollY}>
      {hasTwoActionGroups && (
        <>
          <Title order={4}>{t`Table actions`}</Title>
          <Stack gap="xs">
            {Object.keys(actionsByTable).map((tableId) => (
              <TableActionPicker
                key={tableId}
                title={actionsByTable[tableId][0].table_name}
                actions={actionsByTable[tableId]}
                onClick={onClick}
                currentAction={currentAction}
              />
            ))}
          </Stack>
          <Divider />
          <Title order={4}>{t`Model actions`}</Title>
        </>
      )}
      <Stack gap="xs">
        {sortedModels.map((model) => (
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
      </Stack>
    </Stack>
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
      <CollapseSection
        header={<Title order={5}>{model.name}</Title>}
        initialState={hasCurrentAction ? "expanded" : "collapsed"}
      >
        {actions.length ? (
          <ActionsList>
            {actions.map((action) => (
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
      </CollapseSection>
      {isActionCreatorOpen && (
        <Modal wide onClose={closeModal}>
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

function TableActionPicker({
  onClick,
  title,
  actions,
  currentAction,
}: {
  onClick: (newValue: WritebackAction) => void;
  title: string;
  actions: WritebackAction[];
  currentAction?: WritebackAction;
}) {
  return (
    <>
      <CollapseSection
        header={
          <Title tt="capitalize" order={5}>
            {title}
          </Title>
        }
      >
        {
          <ActionsList>
            {actions.map((action) => {
              return (
                <ActionItem
                  key={action.id}
                  role="button"
                  isSelected={currentAction?.id === action.id}
                  aria-selected={currentAction?.id === action.id}
                  onClick={() => onClick(action)}
                  data-testid={`table-action-item-${action.name}`}
                >
                  <Text c="var(--mb-color-brand)">{action.name}</Text>
                </ActionItem>
              );
            })}
          </ActionsList>
        }
      </CollapseSection>
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
