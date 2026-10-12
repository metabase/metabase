import cx from "classnames";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListActionsQuery, useSearchQuery } from "metabase/api";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToggle } from "metabase/common/hooks/use-toggle";
import CS from "metabase/css/core/index.css";
import { ActionCreator } from "metabase/querying/action-creator";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Modal,
  PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
} from "metabase/ui";
import type { Card, WritebackAction } from "metabase-types/api";

import S from "./ActionPicker.module.css";
import { sortAndGroupActions } from "./utils";

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

  return (
    <div className={CS.scrollY}>
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
          className={S.emptyState}
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

  const newActionButton = (
    <Button
      variant="subtle"
      m="0.25rem 0.75rem"
      onClick={toggleIsActionCreatorVisible}
    >
      {t`Create new action`}
    </Button>
  );

  return (
    <>
      <CollapseSection
        className={S.modelCollapseSection}
        header={<h4>{model.name}</h4>}
        initialState={hasCurrentAction ? "expanded" : "collapsed"}
      >
        {actions.length ? (
          <Box component="ul" px="lg" py="sm">
            {actions.map((action) => (
              <Flex
                key={action.id}
                component="li"
                className={cx(CS.cursorPointer, S.itemBackground, {
                  [S.selected]: currentAction?.id === action.id,
                })}
                justify="space-between"
                align="center"
                px="md"
                py="xs"
                mb={1}
                bdrs="xxs"
                c="core-brand"
                fw="bold"
                role="button"
                aria-selected={currentAction?.id === action.id}
                onClick={() => onClick(action)}
                data-testid={`action-item-${action.name}`}
              >
                <span>{action.name}</span>
                <ActionIcon
                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                    // we have a click listener on the parent
                    event.stopPropagation();

                    setEditingActionId(action.id);
                    toggleIsActionCreatorVisible();
                  }}
                >
                  <Icon name="pencil" />
                </ActionIcon>
              </Flex>
            ))}
            {newActionButton}
          </Box>
        ) : (
          <Box p="lg" c="text-secondary" ta="center">
            <div>{t`There are no actions for this model`}</div>
            {newActionButton}
          </Box>
        )}
      </CollapseSection>
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
          databaseId={model.database_id}
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
