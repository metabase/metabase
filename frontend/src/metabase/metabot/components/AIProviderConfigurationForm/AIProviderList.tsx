import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import {
  useDeleteLlmProviderMutation,
  useListLlmProviderTypesQuery,
  useListLlmProvidersQuery,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Button, Card, Group, Icon, Menu, Stack, Text } from "metabase/ui";
import type {
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import { LlmModelPicker } from "./LlmModelPicker";
import { ProviderConnectionModal } from "./ProviderConnectionModal";
import { ProviderListSkeleton } from "./ProviderListSkeleton";

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

  const handleModalClose = () => {
    stopAdding();
    setEditing(undefined);
  };

  const handleConfirmDelete = async () => {
    if (deleting) {
      await deleteProvider(deleting.key);
      setDeleting(undefined);
    }
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
          onClick={startAdding}
        >
          {hasConnections ? t`Add another provider` : t`Add a provider`}
        </Button>
      </Group>

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
