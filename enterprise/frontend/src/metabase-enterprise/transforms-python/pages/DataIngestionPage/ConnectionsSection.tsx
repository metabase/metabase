import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListTransformsQuery } from "metabase/api";
import { Link } from "metabase/router";
import { formatStatus, isErrorStatus } from "metabase/transforms/utils";
import {
  Anchor,
  Button,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IngestionConnector, Transform } from "metabase-types/api";

import { EditConnectionModal } from "./EditConnectionModal";
import {
  type ConnectionGroup,
  getTransformConnector,
  groupConnections,
} from "./utils";

type ConnectionsSectionProps = {
  connectors: IngestionConnector[];
};

export function ConnectionsSection({ connectors }: ConnectionsSectionProps) {
  const { data: transforms } = useListTransformsQuery({});
  const [editingConnection, setEditingConnection] =
    useState<ConnectionGroup | null>(null);

  const connections = useMemo(
    () => groupConnections(transforms ?? []),
    [transforms],
  );

  if (connections.length === 0) {
    return null;
  }

  const editingConnector =
    editingConnection != null
      ? connectors.find((c) => c.id === editingConnection.connectorId)
      : undefined;

  return (
    <Stack gap="md" mt="xl">
      <Title order={3}>{t`Connections`}</Title>
      {connections.map((connection) => (
        <ConnectionCard
          key={connection.connectionId}
          connection={connection}
          connector={connectors.find((c) => c.id === connection.connectorId)}
          onEdit={() => setEditingConnection(connection)}
        />
      ))}
      {editingConnection != null && editingConnector != null && (
        <EditConnectionModal
          connector={editingConnector}
          connection={editingConnection}
          onClose={() => setEditingConnection(null)}
        />
      )}
    </Stack>
  );
}

type ConnectionCardProps = {
  connection: ConnectionGroup;
  connector: IngestionConnector | undefined;
  onEdit: () => void;
};

function ConnectionCard({
  connection,
  connector,
  onEdit,
}: ConnectionCardProps) {
  const configSummary = getConfigSummary(connection, connector);

  return (
    <Card withBorder p="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={0}>
          <Title order={4}>{connector?.name ?? connection.connectorId}</Title>
          {configSummary !== "" && (
            <Text c="text-secondary" fz="sm">
              {configSummary}
            </Text>
          )}
        </Stack>
        {connector != null && <Button onClick={onEdit}>{t`Edit`}</Button>}
      </Group>
      <Divider my="sm" />
      <Stack gap="xs">
        {connection.transforms.map((transform) => (
          <StreamRow
            key={transform.id}
            transform={transform}
            connector={connector}
          />
        ))}
      </Stack>
    </Card>
  );
}

type StreamRowProps = {
  transform: Transform;
  connector: IngestionConnector | undefined;
};

function StreamRow({ transform, connector }: StreamRowProps) {
  const streamKey = getTransformConnector(transform)?.stream;
  const streamLabel =
    connector?.streams.find((stream) => stream.key === streamKey)?.label ??
    streamKey ??
    transform.name;
  const lastRunStatus = transform.last_run?.status ?? null;

  return (
    <Group justify="space-between" wrap="nowrap">
      <Anchor component={Link} to={Urls.transform(transform.id)} fz="md">
        {streamLabel}
      </Anchor>
      <Text
        c={isErrorStatus(lastRunStatus) ? "error" : "text-secondary"}
        fz="sm"
      >
        {lastRunStatus != null ? formatStatus(lastRunStatus) : t`Never run`}
      </Text>
    </Group>
  );
}

function getConfigSummary(
  connection: ConnectionGroup,
  connector: IngestionConnector | undefined,
): string {
  const entries = Object.entries(connection.config).filter(
    ([, value]) => value !== "",
  );
  return entries
    .map(([key, value]) => {
      const label =
        connector?.["config-fields"].find((field) => field.key === key)
          ?.label ?? key;
      return `${label}: ${value}`;
    })
    .join(" · ");
}
