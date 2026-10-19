import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useDeleteActionMutation,
  useListActionsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { Link } from "metabase/common/components/Link";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Flex,
  Icon,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { parseTimestamp } from "metabase/utils/time-dayjs";
import type Question from "metabase-lib/v1/Question";
import {
  canArchiveAction,
  canEditAction,
  canRunAction,
} from "metabase-lib/v1/actions/utils";
import type { Database, WritebackAction } from "metabase-types/api";

import { ModelActionListItem } from "./ModelActionListItem";
import { useEnableImplicitActionsForModel } from "./useEnableImplicitActionsForModel";

const EMPTY_DATABASE_LIST: Database[] = [];

interface ModelActionDetailsProps {
  model: Question;
}

export function ModelActionDetails({ model }: ModelActionDetailsProps) {
  const { data: databasesResponse } = useListDatabasesQuery();
  const databases = databasesResponse?.data ?? EMPTY_DATABASE_LIST;
  const { data: actions = [] } = useListActionsQuery({
    "model-id": model.id(),
  });
  const [deleteAction] = useDeleteActionMutation();
  const onEnableImplicitActions = useEnableImplicitActionsForModel(model.id());
  const onDeleteAction = useCallback(
    (action: WritebackAction) => deleteAction(action.id),
    [deleteAction],
  );
  const archive = useSetArchive();
  const onArchiveAction = useCallback(
    (action: WritebackAction) =>
      archive({ id: action.id, model: "action" }, true),
    [archive],
  );
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const database = model.database();
  const hasActionsEnabled = database != null && database.hasActionsEnabled();
  const canWrite = model.canWriteActions();
  const supportsImplicitActions = model.supportsImplicitActions();

  const actionsSorted = useMemo(
    () => _.sortBy(actions, mostRecentFirst),
    [actions],
  );

  const implicitActions = useMemo(
    () => actions.filter((action) => action.type === "implicit"),
    [actions],
  );

  const onDeleteImplicitActions = useCallback(() => {
    askConfirmation({
      title: t`Disable basic actions?`,
      message: t`Disabling basic actions will also remove any buttons that use these actions. Are you sure you want to continue?`,
      confirmButtonText: t`Disable`,
      onConfirm: () => {
        implicitActions.forEach((action) => {
          onDeleteAction(action);
        });
      },
    });
  }, [implicitActions, askConfirmation, onDeleteAction]);

  const hasImplicitActions = implicitActions.length > 0;
  const hasActionsMenu = hasImplicitActions || supportsImplicitActions;

  const renderActionListItem = useCallback(
    (action: WritebackAction) => {
      const actionUrl = Urls.action(model.card(), action.id);

      return (
        <li key={action.id} aria-label={action.name}>
          <ModelActionListItem
            action={action}
            actionUrl={actionUrl}
            canRun={canRunAction(action, databases)}
            canEdit={canEditAction(action, model)}
            canArchive={canArchiveAction(action, model)}
            onArchive={onArchiveAction}
          />
        </li>
      );
    },
    [model, databases, onArchiveAction],
  );

  const newActionUrl = Urls.newAction(model.card());

  return (
    <Box w="100%" h="100%" data-testid="model-action-details">
      {canWrite && (
        <Flex
          justify="flex-end"
          align="center"
          data-testid="model-actions-header"
        >
          <Button component={Link} to={newActionUrl}>{t`New action`}</Button>
          {hasActionsMenu && (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon aria-label={t`Actions`} variant="subtle" ml="sm">
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {hasImplicitActions ? (
                  <Menu.Item
                    leftSection={<Icon name="bolt" aria-hidden />}
                    onClick={onDeleteImplicitActions}
                  >
                    {t`Disable basic actions`}
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    leftSection={<Icon name="bolt" aria-hidden />}
                    onClick={onEnableImplicitActions}
                  >
                    {t`Create basic actions`}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </Flex>
      )}
      {database && !hasActionsEnabled && (
        <Alert
          size="compact"
          w="70%"
          icon={<Icon name="warning" />}
          color="error"
        >
          {t`Running Actions is not enabled for database ${database.displayName()}`}
        </Alert>
      )}
      {actions.length > 0 ? (
        <Stack
          component="ul"
          gap="2.25rem"
          w={{ base: "100%", md: "70%" }}
          mt="lg"
          aria-label={t`Action list`}
        >
          {actionsSorted.map(renderActionListItem)}
        </Stack>
      ) : (
        <NoActionsState
          hasCreateButton={canWrite && supportsImplicitActions}
          onCreateClick={onEnableImplicitActions}
        />
      )}
      {confirmationModal}
    </Box>
  );
}

interface NoActionsStateProps {
  hasCreateButton: boolean;
  onCreateClick: () => void;
}

function NoActionsState({
  hasCreateButton,
  onCreateClick,
}: NoActionsStateProps) {
  return (
    <Stack justify="center" gap="sm" h="100%" maw="25rem" m="auto" ta="center">
      <Title
        order={4}
        fz="1rem"
        lh="normal"
        c="text-primary"
      >{t`No actions have been created yet.`}</Title>
      <Text
        component="p"
        mt="sm"
        c="text-secondary"
      >{t`Get started quickly with some basic actions to create, edit and delete, or create your own from scratch.`}</Text>
      {hasCreateButton && (
        <Box mt="lg">
          <Button
            leftSection={<Icon name="bolt" />}
            onClick={onCreateClick}
          >{t`Create basic actions`}</Button>
        </Box>
      )}
    </Stack>
  );
}

function mostRecentFirst(action: WritebackAction) {
  const createdAt = parseTimestamp(action["created_at"]);
  return -createdAt.valueOf();
}
