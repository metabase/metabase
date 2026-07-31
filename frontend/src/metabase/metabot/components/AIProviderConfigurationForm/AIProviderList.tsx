import { useDisclosure } from "@mantine/hooks";
import { Fragment, useState } from "react";
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
import {
  Button,
  Divider,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import { LlmModelPicker } from "./LlmModelPicker";
import { ProviderConnectionModal } from "./ProviderConnectionModal";
import { ProviderListSkeleton } from "./ProviderListSkeleton";
import { ProviderTypeIcon } from "./ProviderTypeIcon";

export function AIProviderList() {
  const { data: connections = [], isLoading: isLoadingConnections } =
    useListLlmProvidersQuery();
  const { data: providerTypes = [], isLoading: isLoadingProviderTypes } =
    useListLlmProviderTypesQuery();
  const [deleteProvider] = useDeleteLlmProviderMutation();

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

  const hasConnections = connections.length > 0;

  const addableProviderTypes = providerTypes.filter(
    (providerType) =>
      !providerType.singleton ||
      !connections.some((connection) => connection.type === providerType.type),
  );

  return (
    <Stack gap="lg">
      <Stack gap="sm">
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

      {hasConnections && <LlmModelPicker />}

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
        message={t`This provider's models will no longer be available, and its saved credentials will be deleted.`}
        confirmButtonText={t`Remove provider`}
        onConfirm={handleConfirmDelete}
      />
    </Stack>
  );
}

function ProviderConnectionRow({
  connection,
  providerType,
  onEdit,
  onDelete,
}: {
  connection: LlmProviderConnection;
  providerType?: LlmProviderType;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isEnvManaged = connection.source === "env";
  const isEditable = !providerType?.managed;
  const typeLabel =
    providerType && providerType.label !== connection.name
      ? providerType.label
      : undefined;

  return (
    <Group justify="space-between" wrap="nowrap" py="sm">
      <Group gap="sm" wrap="nowrap">
        <ProviderTypeIcon
          type={connection.type}
          icon={providerType?.icon ?? "ai"}
          size={32}
        />
        <Stack gap={0}>
          <Group gap="xs" wrap="nowrap">
            <Text fw="bold">{connection.name}</Text>
            {!connection.usable && (
              <Tooltip
                label={t`Some required settings are missing, so Metabot can't use this provider.`}
              >
                <Icon
                  name="warning"
                  c="error"
                  size={14}
                  aria-label={t`Incomplete configuration`}
                />
              </Tooltip>
            )}
          </Group>
          {typeLabel && (
            <Text size="sm" c="text-secondary">
              {typeLabel}
            </Text>
          )}
          {isEnvManaged &&
            connection.env_vars.map((varName) => (
              <SetByEnvVar key={varName} varName={varName} />
            ))}
        </Stack>
      </Group>

      {!isEnvManaged && (
        <Menu position="bottom-end">
          <Menu.Target>
            <Button
              variant="subtle"
              p="xs"
              aria-label={t`Provider options`}
              leftSection={<Icon name="ellipsis" />}
            />
          </Menu.Target>
          <Menu.Dropdown>
            {isEditable && (
              <Menu.Item leftSection={<Icon name="pencil" />} onClick={onEdit}>
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
    </Group>
  );
}
