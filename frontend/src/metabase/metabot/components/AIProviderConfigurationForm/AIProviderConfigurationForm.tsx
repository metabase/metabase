import { useState } from "react";
import { t } from "ttag";

import {
  useDeleteLlmProviderMutation,
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Menu,
  Skeleton,
  Stack,
  Text,
} from "metabase/ui";
import type {
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import { LlmModelPicker } from "./LlmModelPicker";
import { ProviderConnectionForm } from "./ProviderConnectionForm";
import { ProviderConnectionModal } from "./ProviderConnectionModal";

export function AIProviderConfigurationForm({
  isModal = false,
  onClose,
}: {
  isModal?: boolean;
  onClose?: (connection?: LlmProviderConnection) => void;
}) {
  const { data: connections = [], isLoading: isLoadingConnections } =
    useListLlmProvidersQuery();
  const { data: providerTypes = [], isLoading: isLoadingProviderTypes } =
    useListLlmProviderTypesQuery();
  const [deleteProvider] = useDeleteLlmProviderMutation();

  const [editing, setEditing] = useState<LlmProviderConnection | undefined>();
  const [isAdding, setIsAdding] = useState(false);
  const [deleting, setDeleting] = useState<LlmProviderConnection | undefined>();
  const onProviderRemoved = PLUGIN_METABOT.useOnProviderRemoved();

  const handleModalClose = (saved?: LlmProviderConnection) => {
    setIsAdding(false);
    setEditing(undefined);
    if (saved && isModal) {
      onClose?.(saved);
    }
  };

  const handleConfirmDelete = async () => {
    if (deleting) {
      await onProviderRemoved(deleting.type);
      await deleteProvider(deleting.key);
      setDeleting(undefined);
    }
  };

  const hasConnections = connections.length > 0;

  const addableProviderTypes = providerTypes.filter(
    (providerType) =>
      !providerType.singleton ||
      !connections.some((connection) => connection.type === providerType.type),
  );

  if (isLoadingConnections || isLoadingProviderTypes) {
    return <ProviderListSkeleton />;
  }

  if (isModal) {
    return hasConnections ? (
      <Stack gap="lg">
        <LlmModelPicker />
        <Flex justify="end">
          <Button variant="filled" onClick={() => onClose?.()}>
            {t`Done`}
          </Button>
        </Flex>
      </Stack>
    ) : (
      <ProviderConnectionForm
        providerTypes={addableProviderTypes}
        onSaved={(saved) => onClose?.(saved)}
      />
    );
  }

  return (
    <Stack gap="lg">
      {hasConnections && (
        <Stack gap="sm">
          {connections.map((connection) => (
            <ProviderConnectionCard
              key={connection.key}
              connection={connection}
              providerType={providerTypes.find(
                (type) => type.type === connection.type,
              )}
              onEdit={() => setEditing(connection)}
              onDelete={() => setDeleting(connection)}
            />
          ))}
        </Stack>
      )}

      <Group justify="space-between">
        <Button
          variant={hasConnections ? "subtle" : "filled"}
          leftSection={<Icon name="add" />}
          onClick={() => setIsAdding(true)}
        >
          {hasConnections ? t`Add another provider` : t`Add a provider`}
        </Button>
      </Group>

      {hasConnections && !isModal && <LlmModelPicker />}

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

function ProviderListSkeleton() {
  return (
    <Stack gap="sm" data-testid="provider-list-skeleton">
      <Skeleton h="4rem" radius="md" />
      <Skeleton h="4rem" radius="md" />
    </Stack>
  );
}

function ProviderConnectionCard({
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
  const subtitle = isEnvManaged ? t`Set by environment variables` : typeLabel;

  return (
    <Card p="md" withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Icon
            name={connection.usable ? "check" : "warning"}
            c={connection.usable ? "success" : "error"}
          />
          <Stack gap={0}>
            <Text fw="bold">{connection.name}</Text>
            {subtitle && (
              <Text size="sm" c="text-secondary">
                {subtitle}
              </Text>
            )}
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
      </Group>
    </Card>
  );
}
