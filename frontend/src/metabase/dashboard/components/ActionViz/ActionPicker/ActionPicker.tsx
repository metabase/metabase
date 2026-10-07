import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListActionsQuery, useSearchQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToggle } from "metabase/common/hooks/use-toggle";
import CS from "metabase/css/core/index.css";
import { ActionCreator } from "metabase/querying/action-creator";
import {
  ActionIcon,
  Icon,
  Modal,
  PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Card, WritebackAction } from "metabase-types/api";

import {
  ActionItem,
  ActionsList,
  EmptyModelStateContainer,
  EmptyState,
  ModelCollapseSection,
} from "./ActionPicker.styled";
import { getSortedActionsWithoutModel, sortAndGroupActions } from "./utils";

type ActionPickerModel = Pick<Card, "id" | "name" | "database_id">;

export function ActionPicker({
  models,
  actions,
  onClick,
  currentAction,
}: {
  models: ActionPickerModel[];
  actions: WritebackAction[];
  onClick: (action: WritebackAction) => void;
  currentAction?: WritebackAction;
}) {
  const sortedModels =
    useMemo(
      () => models?.toSorted((a, b) => a.name.localeCompare(b.name)),
      [models],
    ) ?? [];

  const actionsByModel = useMemo(() => sortAndGroupActions(actions), [actions]);
  const actionsWithoutModel = useMemo(
    () => getSortedActionsWithoutModel(actions),
    [actions],
  );
  const isEmpty = sortedModels.length === 0 && actionsWithoutModel.length === 0;

  return (
    <div className={CS.scrollY}>
      {actionsWithoutModel.length > 0 && (
        <DataActionPicker
          actions={actionsWithoutModel}
          currentAction={currentAction}
          onClick={onClick}
        />
      )}
      {sortedModels.map((model) => (
        <ModelActionPicker
          key={model.id}
          model={model}
          actions={actionsByModel[model.id] ?? []}
          onClick={onClick}
          currentAction={currentAction}
        />
      ))}
      {isEmpty && (
        <EmptyState
          message={t`No actions found`}
          action={t`Create new action`}
          link={Urls.newDataAction()}
        />
      )}
    </div>
  );
}

type DataActionPickerProps = {
  actions: WritebackAction[];
  currentAction?: WritebackAction;
  onClick: (action: WritebackAction) => void;
};

function DataActionPicker({
  actions,
  currentAction,
  onClick,
}: DataActionPickerProps) {
  const hasCurrentAction =
    currentAction != null && currentAction.model_id == null;

  return (
    <ModelCollapseSection
      header={<h4>{t`Data actions`}</h4>}
      initialState={hasCurrentAction ? "expanded" : "collapsed"}
    >
      <ActionsList>
        {actions.map((action) => (
          <ActionPickerItem
            key={action.id}
            action={action}
            isSelected={currentAction?.id === action.id}
            onClick={onClick}
          />
        ))}
      </ActionsList>
    </ModelCollapseSection>
  );
}

type ActionPickerItemProps = {
  action: WritebackAction;
  isSelected: boolean;
  onClick: (action: WritebackAction) => void;
  onEdit?: (action: WritebackAction) => void;
};

function ActionPickerItem({
  action,
  isSelected,
  onClick,
  onEdit,
}: ActionPickerItemProps) {
  return (
    <ActionItem
      role="button"
      isSelected={isSelected}
      aria-selected={isSelected}
      onClick={() => onClick(action)}
      data-testid={`action-item-${action.name}`}
    >
      <span>{action.name}</span>
      {onEdit && (
        <ActionIcon
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            // we have a click listener on the parent
            event.stopPropagation();
            onEdit(action);
          }}
        >
          <Icon name="pencil" />
        </ActionIcon>
      )}
    </ActionItem>
  );
}

function ModelActionPicker({
  onClick,
  model,
  actions,
  currentAction,
}: {
  onClick: (newValue: WritebackAction) => void;
  model: ActionPickerModel;
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

  const handleEdit = (action: WritebackAction) => {
    setEditingActionId(action.id);
    toggleIsActionCreatorVisible();
  };

  return (
    <>
      <ModelCollapseSection
        header={<h4>{model.name}</h4>}
        initialState={hasCurrentAction ? "expanded" : "collapsed"}
      >
        {actions.length ? (
          <ActionsList>
            {actions.map((action) => (
              <ActionPickerItem
                key={action.id}
                action={action}
                isSelected={currentAction?.id === action.id}
                onClick={onClick}
                onEdit={handleEdit}
              />
            ))}
          </ActionsList>
        ) : (
          <EmptyModelStateContainer>
            <div>{t`There are no actions for this model`}</div>
          </EmptyModelStateContainer>
        )}
      </ModelCollapseSection>
      <Modal
        {...PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS}
        opened={isActionCreatorOpen}
        onClose={closeModal}
        size="95%"
        withCloseButton={false}
        padding={0}
      >
        <ActionCreator
          modelId={model.id}
          actionId={editingActionId}
          onClose={closeModal}
          onSubmit={handleModalSubmit}
        />
      </Modal>
    </>
  );
}

function ActionPickerWithModels(
  props: Omit<Parameters<typeof ActionPicker>[0], "models" | "actions">,
) {
  const {
    data: searchResponse,
    isLoading: isLoadingSearch,
    error: searchError,
  } = useSearchQuery({ models: ["dataset"], context: "entity-picker" });
  const {
    data: actions = [],
    isLoading: isLoadingActions,
    error: actionsError,
  } = useListActionsQuery({});
  const models = (searchResponse?.data ?? []).flatMap((result) =>
    typeof result.id === "number"
      ? [
          {
            id: result.id,
            name: result.name,
            database_id: result.database_id,
          },
        ]
      : [],
  );
  const isLoading = isLoadingSearch || isLoadingActions;
  const error = searchError || actionsError;
  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      <ActionPicker {...props} models={models} actions={actions} />
    </LoadingAndErrorWrapper>
  );
}

export const ConnectedActionPicker = ActionPickerWithModels;
