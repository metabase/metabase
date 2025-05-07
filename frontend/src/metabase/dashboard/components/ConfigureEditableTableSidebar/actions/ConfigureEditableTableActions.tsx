import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { ActionDashcardSettings } from "metabase/actions/components/ActionViz";
import { useListActionsQuery } from "metabase/api";
import Modal from "metabase/components/Modal";
import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { getDashboard } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Button, Checkbox, Stack, Title } from "metabase/ui";
import type {
  DashboardCard,
  EditableTableRowActionDisplaySetting,
} from "metabase-types/api";

import { RowActionItem } from "./RowActionItem";

const DEFAULT_ACTIONS = [
  {
    id: "row/create" as const,
    get label() {
      return t`Create a new record`;
    },
  },
  {
    id: "row/delete" as const,
    get label() {
      return t`Delete a record`;
    },
  },
];

export const ConfigureEditableTableActions = ({
  dashcard,
}: {
  dashcard: DashboardCard;
}) => {
  const [isOpen, { close, open }] = useDisclosure(false);
  const dispatch = useDispatch();

  const dashboard = useSelector(getDashboard);

  const enabledActions =
    dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];

  const { data: actions } = useListActionsQuery({}); // TODO: we should have an api to optimize this

  const rowActions =
    actions?.filter(({ id }) =>
      enabledActions.find(({ id: itemId }) => itemId === id),
    ) || [];

  const handleToggleAction = useCallback(
    ({ id, enabled }: EditableTableRowActionDisplaySetting) => {
      const enabledActions =
        dashcard.visualization_settings?.["editableTable.enabledActions"] || [];

      const newArray = [...enabledActions];

      const actionIndex = enabledActions.findIndex(
        (action) => action.id === id,
      );

      if (actionIndex > -1) {
        newArray[actionIndex] = {
          ...enabledActions[actionIndex],
          enabled,
        };
      } else {
        newArray.push({
          id,
          enabled,
        });
      }

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [dashcard.visualization_settings, dashcard.id, dispatch],
  );

  const handleAddAction = useCallback(
    (actionId: number) => {
      const enabledActions =
        dashcard.visualization_settings?.["editableTable.enabledActions"] || [];

      const newArray = [
        ...enabledActions,
        {
          id: actionId,
          enabled: true,
        },
      ];

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [dashcard.id, dashcard.visualization_settings, dispatch],
  );

  const handleRemoveAction = useCallback(
    (actionId: number) => {
      const enabledActions =
        dashcard.visualization_settings?.["editableTable.enabledActions"] || [];

      const newArray = enabledActions.filter(({ id }) => id !== actionId);

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [dashcard.id, dashcard.visualization_settings, dispatch],
  );

  return (
    <>
      <Box>
        <Title order={4} mb="sm">{t`Default actions`}</Title>
        <Stack gap="xs">
          {DEFAULT_ACTIONS.map(({ id, label }) => {
            const isEnabled =
              enabledActions.find(({ id: itemId }) => itemId === id)?.enabled ||
              false;

            return (
              <Checkbox
                key={id}
                label={label}
                checked={isEnabled}
                onChange={() => handleToggleAction({ id, enabled: !isEnabled })}
              />
            );
          })}
        </Stack>

        <Title order={4} mt="md" mb="sm">{t`Row actions`}</Title>
        {rowActions?.map((action) => {
          const isEnabled =
            enabledActions.find(({ id: itemId }) => itemId === action.id)
              ?.enabled || false;

          return (
            <RowActionItem
              key={action.id}
              action={action}
              isEnabled={isEnabled}
              onToggle={handleToggleAction}
              onRemove={handleRemoveAction}
            />
          );
        })}
        <Button
          variant="subtle"
          p={0}
          onClick={open}
        >{t`Add new row action`}</Button>
      </Box>
      {dashboard && (
        <Modal isOpen={isOpen} fit onClose={close}>
          <ActionDashcardSettings
            dashboard={dashboard}
            dashcard={dashcard}
            setActionForDashcard={(_, action) => handleAddAction(action.id)}
            onClose={close}
          />
        </Modal>
      )}
    </>
  );
};
