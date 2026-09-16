import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useSearchParams } from "metabase/router";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";
import {
  ActionIcon,
  Badge,
  Button,
  Flex,
  Group,
  Icon,
  Menu,
  Paper,
  Stack,
  Text,
} from "metabase/ui";
import type { McpServer } from "metabase-types/api";

import {
  useConnectMcpServerMutation,
  useDeleteMcpServerMutation,
  useDisconnectMcpServerMutation,
  useListMcpServersQuery,
} from "../../settings/api/mcp-client";

import { McpServerModal } from "./McpServerModal";
import { McpServerToolsModal } from "./McpServerToolsModal";
import {
  type McpServerPreset,
  getAuthStrategyLabel,
  getMcpServerPresets,
} from "./presets";

type ModalState =
  | { type: "create"; preset: McpServerPreset }
  | { type: "edit"; server: McpServer }
  | { type: "tools"; server: McpServer }
  | null;

const CONNECTED_PARAM = "mcp_connected";
const ERROR_PARAM = "mcp_error";

export function ExternalMcpServersPage() {
  const { data: servers = [], isLoading, error } = useListMcpServersQuery();
  const [modal, setModal] = useState<ModalState>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [sendToast] = useToast();

  // the OAuth callback lands here with the outcome in the query string
  useEffect(() => {
    const connected = searchParams.get(CONNECTED_PARAM);
    const oauthError = searchParams.get(ERROR_PARAM);
    if (connected || oauthError) {
      sendToast(
        oauthError
          ? { message: t`Couldn't connect: ${oauthError}`, icon: "warning" }
          : { message: t`Connected`, icon: "check" },
      );
      const next = new URLSearchParams(searchParams);
      next.delete(CONNECTED_PARAM);
      next.delete(ERROR_PARAM);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, sendToast]);

  return (
    <SettingsPageWrapper
      title={t`External MCP servers`}
      description={t`Give Metabot tools from other services over the Model Context Protocol. Admins add servers here; each person then connects their own account.`}
    >
      <SettingsSection
        title={
          <Flex align="center" justify="space-between" w="100%">
            <div>{t`Servers`}</div>
            <AddServerMenu
              onSelect={(preset) => setModal({ type: "create", preset })}
            />
          </Flex>
        }
      >
        <LoadingAndErrorWrapper loading={isLoading} error={error}>
          {servers.length === 0 ? (
            <Text c="text-secondary">{t`No external MCP servers yet. Add Notion, Linear, or any server that speaks MCP over HTTP.`}</Text>
          ) : (
            <Stack gap="md">
              {servers.map((server) => (
                <McpServerRow
                  key={server.id}
                  server={server}
                  onEdit={() => setModal({ type: "edit", server })}
                  onShowTools={() => setModal({ type: "tools", server })}
                />
              ))}
            </Stack>
          )}
        </LoadingAndErrorWrapper>
      </SettingsSection>
      {modal?.type === "create" && (
        <McpServerModal
          mode="create"
          preset={modal.preset}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "edit" && (
        <McpServerModal
          mode="edit"
          server={modal.server}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "tools" && (
        <McpServerToolsModal
          server={modal.server}
          onClose={() => setModal(null)}
        />
      )}
    </SettingsPageWrapper>
  );
}

function AddServerMenu({
  onSelect,
}: {
  onSelect: (preset: McpServerPreset) => void;
}) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button variant="filled" leftSection={<Icon name="add" />}>
          {t`Add server`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {getMcpServerPresets().map((preset) => (
          <Menu.Item key={preset.provider} onClick={() => onSelect(preset)}>
            {preset.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function McpServerRow({
  server,
  onEdit,
  onShowTools,
}: {
  server: McpServer;
  onEdit: () => void;
  onShowTools: () => void;
}) {
  const [connect, { isLoading: isConnecting }] = useConnectMcpServerMutation();
  const [disconnect, { isLoading: isDisconnecting }] =
    useDisconnectMcpServerMutation();
  const [deleteServer] = useDeleteMcpServerMutation();
  const [sendToast] = useToast();
  const { modalContent, show: showConfirmation } = useConfirmation();

  const isConnected = server.connection?.status === "connected";
  const canListTools = isConnected || server.auth_strategy !== "oauth";

  const handleConnect = useCallback(async () => {
    try {
      const result = await connect(server.id).unwrap();
      if (result.redirect_url) {
        window.location.assign(result.redirect_url);
      } else {
        sendToast({ message: t`Connected to ${server.name}`, icon: "check" });
      }
    } catch (e) {
      sendToast({
        message: t`Couldn't connect to ${server.name}`,
        icon: "warning",
      });
    }
  }, [connect, server, sendToast]);

  const handleDelete = useCallback(() => {
    showConfirmation({
      title: t`Remove ${server.name}?`,
      message: t`Everyone's connection to this server will be removed too.`,
      confirmButtonText: t`Remove`,
      confirmButtonProps: { color: "danger" },
      onConfirm: () => deleteServer(server.id),
    });
  }, [showConfirmation, deleteServer, server]);

  return (
    <Paper withBorder p="lg" radius="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="xs" style={{ minWidth: 0 }}>
          <Group gap="sm">
            <Text fw="bold">{server.name}</Text>
            <Badge variant="light">
              {getAuthStrategyLabel(server.auth_strategy)}
            </Badge>
            {!server.enabled && <Badge color="neutral">{t`Disabled`}</Badge>}
          </Group>
          <Text c="text-secondary" fz="sm" truncate>
            {server.url}
          </Text>
          <ConnectionStatus server={server} />
        </Stack>
        <Group gap="sm" wrap="nowrap">
          {canListTools && (
            <Button variant="subtle" onClick={onShowTools}>
              {t`Tools`}
            </Button>
          )}
          {isConnected ? (
            <Button
              variant="default"
              loading={isDisconnecting}
              onClick={() => disconnect(server.id)}
            >
              {t`Disconnect`}
            </Button>
          ) : (
            <Button
              variant="filled"
              loading={isConnecting}
              disabled={!server.enabled}
              onClick={handleConnect}
            >
              {t`Connect`}
            </Button>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon aria-label={t`Server options`}>
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<Icon name="pencil" />} onClick={onEdit}>
                {t`Edit`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="trash" />}
                onClick={handleDelete}
              >
                {t`Remove`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      {modalContent}
    </Paper>
  );
}

function ConnectionStatus({ server }: { server: McpServer }) {
  const connection = server.connection;
  if (!connection) {
    return (
      <Text c="text-secondary" fz="sm">
        {server.auth_strategy === "oauth"
          ? t`Not connected`
          : t`Not connected yet`}
      </Text>
    );
  }
  switch (connection.status) {
    case "connected": {
      const account = connection.account;
      const accountName =
        typeof account?.workspace_name === "string"
          ? account.workspace_name
          : null;
      return (
        <Text c="success" fz="sm">
          {accountName ? t`Connected to ${accountName}` : t`Connected`}
        </Text>
      );
    }
    case "pending":
      return (
        <Text
          c="text-secondary"
          fz="sm"
        >{t`Waiting for you to finish signing in`}</Text>
      );
    case "error":
      return (
        <Text c="error" fz="sm">
          {connection.error
            ? t`Connection problem: ${connection.error}`
            : t`Connection problem`}
        </Text>
      );
  }
}
