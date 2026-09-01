import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { Fragment, useId, useState } from "react";
import { t } from "ttag";

import {
  useDeleteLlmProviderMutation,
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useToast } from "metabase/common/hooks";
import { useLlmConnectionModels } from "metabase/metabot/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
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

import { ProviderConnectionModal } from "./ProviderConnectionModal";
import { ProviderTypeIcon } from "./ProviderTypeIcon";
import { getAddableProviderTypes } from "./addable-provider-types";

const PROVIDER_ICON_SIZE = 32;
const ROW_LINES = 2;
const ROW_LINE_HEIGHT = `${PROVIDER_ICON_SIZE / ROW_LINES}px`;
const PROVIDER_DETAILS_INDENT = "2.5rem";
// The warning glyph fills its viewBox, so it only sits on the label's cap band at this size.
const WARNING_ICON_SIZE = 12;

// mirrors a two-connection list: rows the height of PROVIDER_ICON_SIZE plus their py="sm",
// divided the same way, then the button that follows them
export function ProviderListSkeleton() {
  return (
    <Stack gap="xs" data-testid="provider-list-skeleton">
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
  const { errorByConnectionKey } = useLlmConnectionModels();

  const [isAdding, { open: startAdding, close: stopAdding }] =
    useDisclosure(false);
  const [editing, setEditing] = useState<LlmProviderConnection | undefined>();
  const [deleting, setDeleting] = useState<LlmProviderConnection | undefined>();
  const [sendToast] = useToast();

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

  const addableProviderTypes = getAddableProviderTypes(
    providerTypes,
    connections,
  );

  return (
    <Stack gap="md">
      <Stack gap="xs">
        {hasConnections && (
          <Stack gap={0}>
            {connections.map((connection, index) => (
              <Fragment key={connection.key}>
                {index > 0 && <Divider />}
                <ProviderConnectionRow
                  connection={connection}
                  providerType={providerTypes.find(
                    (type) => type.type === connection.type,
                  )}
                  modelsError={errorByConnectionKey[connection.key]}
                  onEdit={() => setEditing(connection)}
                  onDelete={() => setDeleting(connection)}
                />
              </Fragment>
            ))}
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
    <Group gap="xs" wrap="nowrap" h={PROVIDER_ICON_SIZE} align="center">
      {children}
    </Group>
  );
}

function ProviderConnectionRow({
  connection,
  providerType,
  modelsError,
  onEdit,
  onDelete,
}: {
  connection: LlmProviderConnection;
  providerType?: LlmProviderType;
  modelsError?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isEnvManaged = connection.source === "env";
  const isEditable = !providerType?.managed;
  const typeLabel =
    providerType && providerType.label !== connection.name
      ? providerType.label
      : undefined;

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
        <Group gap="xs" wrap="nowrap">
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
        {modelsError && (
          <Text size="sm" c="error" lh={ROW_LINE_HEIGHT}>
            {modelsError}
          </Text>
        )}
      </Stack>
    </Group>
  );

  return (
    <Stack gap={0} data-testid={`provider-${connection.key}`}>
      <Group justify="space-between" wrap="nowrap" align="flex-start" py="sm">
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
          <Box pl={PROVIDER_DETAILS_INDENT} pb="md">
            <MetabaseAIProviderSetup isConnected />
          </Box>
        </Collapse>
      )}
    </Stack>
  );
}
