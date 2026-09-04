import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useCallback, useId, useState } from "react";
import { t } from "ttag";

import {
  useDeleteLlmProviderMutation,
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
  useReorderLlmProvidersMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import {
  type DragEndEvent,
  Sortable,
  type SortableDragHandle,
  SortableList,
} from "metabase/common/components/Sortable";
import { useToast } from "metabase/common/hooks";
import { useLlmConnectionModels } from "metabase/metabot/hooks";
import { PLUGIN_AI_CONTROLS, PLUGIN_METABOT } from "metabase/plugins";
import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Icon,
  Menu,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type {
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import S from "./AIProviderList.module.css";
import { ProviderConnectionModal } from "./ProviderConnectionModal";
import { ProviderTypeIcon } from "./ProviderTypeIcon";
import { getAddableProviderTypes } from "./addable-provider-types";

const PROVIDER_ICON_SIZE = 32;
const ROW_LINES = 2;
const ROW_LINE_HEIGHT = `${PROVIDER_ICON_SIZE / ROW_LINES}px`;
const PROVIDER_DETAILS_INDENT = "2.5rem";
// The warning glyph fills its viewBox, so it only sits on the label's cap band at this size.
const WARNING_ICON_SIZE = 12;
// Far enough that a click on the row's menu or its expander is never read as the start of a drag.
const DRAG_ACTIVATION_DISTANCE = 10;

// mirrors a two-connection list: rows the height of PROVIDER_ICON_SIZE plus their py="sm",
// divided the same way, then the button that follows them
export function ProviderListSkeleton() {
  return (
    <Stack gap="xxs" data-testid="provider-list-skeleton">
      <Stack gap={0}>
        <ProviderRowSkeleton />
        <Divider />
        <ProviderRowSkeleton />
      </Stack>
      <Skeleton h="1.5rem" w="10rem" />
    </Stack>
  );
}

function ProviderRowSkeleton() {
  return (
    <Box py="sm">
      <Skeleton h={PROVIDER_ICON_SIZE} />
    </Box>
  );
}

export function AIProviderList() {
  const {
    data: connections = [],
    isLoading: isLoadingConnections,
    error: connectionsError,
  } = useListLlmProvidersQuery();
  const {
    data: providerTypes = [],
    isLoading: isLoadingProviderTypes,
    error: providerTypesError,
  } = useListLlmProviderTypesQuery();
  const [deleteProvider] = useDeleteLlmProviderMutation();
  const [reorderProviders] = useReorderLlmProvidersMutation();
  const { errorByConnectionKey } = useLlmConnectionModels();

  const [isAdding, { open: startAdding, close: stopAdding }] =
    useDisclosure(false);
  // Bumped when saving a reorder fails: SortableList keeps the dragged order internally and only resyncs
  // from `items` when they change, which a failed save never makes happen — remounting snaps it back to
  // the order the server actually holds.
  const [sortableResetKey, setSortableResetKey] = useState(0);
  const [editing, setEditing] = useState<LlmProviderConnection | undefined>();
  const [deleting, setDeleting] = useState<LlmProviderConnection | undefined>();
  const [sendToast] = useToast();

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE },
  });

  const getConnectionKey = useCallback(
    (connection: LlmProviderConnection) => connection.key,
    [],
  );

  const handleModalClose = () => {
    stopAdding();
    setEditing(undefined);
  };

  const handleConfirmDelete = async () => {
    if (!deleting) {
      return;
    }
    const { error } = await deleteProvider(deleting.key);
    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Unable to remove this provider.`),
        icon: "warning",
        toastColor: "feedback-negative",
      });
      return;
    }
    setDeleting(undefined);
  };

  const handleSortEnd = async ({ itemIds }: DragEndEvent) => {
    const { error } = await reorderProviders({ order: itemIds.map(String) });
    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Unable to reorder your providers.`),
        icon: "warning",
        toastColor: "feedback-negative",
      });
      setSortableResetKey((key) => key + 1);
    }
  };

  if (isLoadingConnections || isLoadingProviderTypes) {
    return <ProviderListSkeleton />;
  }

  const loadError = connectionsError ?? providerTypesError;
  if (loadError) {
    return (
      <Text c="error">
        {getErrorMessage(loadError, t`Unable to load your AI providers.`)}
      </Text>
    );
  }

  const hasConnections = connections.length > 0;
  const canReorder =
    connections.length > 1 && connections.some((c) => c.reorderable);

  const addableProviderTypes = getAddableProviderTypes(
    providerTypes,
    connections,
  );

  const isDraggable = (connection: LlmProviderConnection) =>
    canReorder && connection.reorderable;

  return (
    <Stack gap="lg">
      <Stack gap="xxs">
        {hasConnections && (
          <Stack gap={0}>
            <SortableList
              key={sortableResetKey}
              items={connections}
              getId={getConnectionKey}
              sensors={[pointerSensor]}
              onSortEnd={handleSortEnd}
              // `afterIndex` is matched against an item's index, and the divider renders above it,
              // so the dividers between rows are the indexes past the first.
              dividers={connections.slice(1).map((_, index) => ({
                afterIndex: index + 1,
                renderFn: () => <Divider />,
              }))}
              renderItem={({ item }) => (
                <Sortable
                  key={item.key}
                  id={item.key}
                  disabled={!isDraggable(item)}
                  draggingStyle={{
                    opacity: 0.5,
                    backgroundColor: "var(--mb-color-background-primary)",
                    borderRadius: "0.5rem",
                  }}
                  role="listitem"
                >
                  {(dragHandle) => (
                    <ProviderConnectionRow
                      connection={item}
                      providerType={providerTypes.find(
                        (type) => type.type === item.type,
                      )}
                      modelsError={errorByConnectionKey[item.key]}
                      dragHandle={isDraggable(item) ? dragHandle : undefined}
                      onEdit={() => setEditing(item)}
                      onDelete={() => setDeleting(item)}
                    />
                  )}
                </Sortable>
              )}
            />
          </Stack>
        )}

        <Button
          variant={hasConnections ? "subtle" : "filled"}
          p={hasConnections ? 0 : undefined}
          w="fit-content"
          leftSection={<Icon name="add" />}
          onClick={startAdding}
        >
          {hasConnections ? t`Add another provider` : t`Add a provider`}
        </Button>
      </Stack>

      {hasConnections && <PLUGIN_AI_CONTROLS.ProviderFallbackSettings />}

      {(isAdding || editing) && (
        <ProviderConnectionModal
          providerTypes={editing ? providerTypes : addableProviderTypes}
          connection={editing}
          onClose={handleModalClose}
        />
      )}

      <ConfirmModal
        opened={deleting != null}
        onClose={() => setDeleting(undefined)}
        title={t`Remove this provider?`}
        message={getDeleteWarning(deleting, providerTypes)}
        confirmButtonText={t`Remove provider`}
        onConfirm={handleConfirmDelete}
      />
    </Stack>
  );
}

// Features that read a fixed connection key directly rather than following the Metabot selection: deleting
// the connection they name turns them off, which the admin deserves to hear before confirming.
const KEYED_DEPENDENTS: Record<string, () => string> = {
  anthropic: () =>
    t`SQL generation also runs on this connection, and will stop working without it.`,
  openai: () =>
    t`Semantic search also runs on this connection, and will stop working without it.`,
};

function getDeleteWarning(
  deleting: LlmProviderConnection | undefined,
  providerTypes: LlmProviderType[],
) {
  const base = providerTypes.find((type) => type.type === deleting?.type)
    ?.managed
    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
      t`This cancels your Metabase AI service subscription, and its models will no longer be available.`
    : t`This provider's models will no longer be available, and its saved credentials will be deleted.`;
  const dependent = deleting && KEYED_DEPENDENTS[deleting.key]?.();
  return dependent ? `${base} ${dependent}` : base;
}

function RowActions({ children }: { children: ReactNode }) {
  return (
    <Group gap="xxs" wrap="nowrap" h={PROVIDER_ICON_SIZE} align="center">
      {children}
    </Group>
  );
}

function ProviderConnectionRow({
  connection,
  providerType,
  modelsError,
  dragHandle,
  onEdit,
  onDelete,
}: {
  connection: LlmProviderConnection;
  providerType?: LlmProviderType;
  modelsError?: string;
  dragHandle?: SortableDragHandle;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isEnvManaged = connection.source === "env";
  const isEditable = !providerType?.managed;
  const typeLabel =
    providerType && providerType.label !== connection.name
      ? providerType.label
      : undefined;
  // The stored failure outlives the request that found it, so it is what the row reports; the model listing is
  // only a fresher source for a connection whose failure has not been recorded yet.
  const errorMessage = connection.error?.message ?? modelsError;

  const MetabaseAIProviderSetup = PLUGIN_METABOT.MetabaseAIProviderSetup;
  const hasUsageDetails =
    Boolean(providerType?.managed) &&
    PLUGIN_METABOT.hasMetabaseManagedProviderDetails();
  const [isShowingDetails, { toggle: toggleDetails }] = useDisclosure(true);
  const detailsId = useId();

  const summary = (
    <Group gap="sm" wrap="nowrap" flex={1} align="flex-start">
      <ProviderTypeIcon type={connection.type} size={PROVIDER_ICON_SIZE} />
      <Stack
        gap={0}
        align="flex-start"
        justify="center"
        mih={PROVIDER_ICON_SIZE}
      >
        <Group gap="xxs" wrap="nowrap">
          <Text fw="bold" lh={ROW_LINE_HEIGHT}>
            {connection.name}
          </Text>
          {!connection.usable && (
            <Tooltip
              label={t`Some required settings are missing, so Metabot can't use this provider.`}
            >
              <Icon
                name="warning"
                c="error"
                size={WARNING_ICON_SIZE}
                aria-label={t`Incomplete configuration`}
              />
            </Tooltip>
          )}
        </Group>
        {typeLabel && (
          <Text size="sm" c="text-secondary" lh={ROW_LINE_HEIGHT}>
            {typeLabel}
          </Text>
        )}
        {errorMessage && (
          <Text size="sm" c="error" lh={ROW_LINE_HEIGHT}>
            {errorMessage}
          </Text>
        )}
      </Stack>
    </Group>
  );

  return (
    <Stack gap={0} data-testid={`provider-${connection.key}`}>
      <Group justify="space-between" wrap="nowrap" align="flex-start" py="sm">
        {dragHandle && (
          <Box
            component="span"
            ref={dragHandle.dragHandleRef}
            className={S.grabber}
            h={PROVIDER_ICON_SIZE}
            aria-label={t`Reorder ${connection.name}`}
            data-testid="provider-drag-handle"
            {...dragHandle.dragHandleListeners}
          >
            <Icon name="grabber" c="text-secondary" />
          </Box>
        )}

        {hasUsageDetails ? (
          <UnstyledButton
            flex={1}
            aria-label={t`Usage and pricing`}
            aria-expanded={isShowingDetails}
            aria-controls={detailsId}
            onClick={toggleDetails}
          >
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              {summary}
              <RowActions>
                <Icon
                  name={isShowingDetails ? "chevronup" : "chevrondown"}
                  size={12}
                />
              </RowActions>
            </Group>
          </UnstyledButton>
        ) : (
          summary
        )}

        <RowActions>
          {!isEnvManaged && (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon aria-label={t`Provider options`}>
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {isEditable && (
                  <Menu.Item
                    leftSection={<Icon name="pencil" />}
                    onClick={onEdit}
                  >
                    {t`Edit`}
                  </Menu.Item>
                )}
                <Menu.Item
                  leftSection={<Icon name="trash" />}
                  c="error"
                  onClick={onDelete}
                >
                  {t`Remove`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </RowActions>
      </Group>

      {connection.env_vars.map((varName) => (
        <SetByEnvVar key={varName} varName={varName} />
      ))}

      {hasUsageDetails && (
        <Collapse id={detailsId} in={isShowingDetails}>
          <Box pl={PROVIDER_DETAILS_INDENT} pb="lg">
            <MetabaseAIProviderSetup isConnected />
          </Box>
        </Collapse>
      )}
    </Stack>
  );
}
