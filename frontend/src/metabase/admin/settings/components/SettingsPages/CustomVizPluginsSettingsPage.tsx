import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  useCreateCustomVizPluginMutation,
  useDeleteCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
} from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import {
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import type { CustomVizPlugin } from "metabase-types/api";

function PluginStatusBadge({ status }: { status: CustomVizPlugin["status"] }) {
  const color =
    status === "active" ? "success" : status === "error" ? "error" : "warning";
  return <Badge color={color}>{status}</Badge>;
}

function PluginListItem({
  plugin,
  onDelete,
}: {
  plugin: CustomVizPlugin;
  onDelete: (id: number) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(plugin.id);
    } finally {
      setIsDeleting(false);
    }
  }, [plugin.id, onDelete]);

  return (
    <Flex
      justify="space-between"
      align="center"
      p="md"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mb-radius-md)",
      }}
    >
      <Stack gap="xs">
        <Group gap="sm">
          <Text fw={700}>{plugin.display_name}</Text>
          <PluginStatusBadge status={plugin.status} />
        </Group>
        <Text size="sm" c="text-tertiary">
          {plugin.repo_url}
        </Text>
        {plugin.error_message && (
          <Text size="sm" c="error">
            {plugin.error_message}
          </Text>
        )}
        {plugin.resolved_commit && (
          <Text size="sm" c="text-tertiary">
            {t`Commit`}: {plugin.resolved_commit.slice(0, 8)}
            {plugin.pinned_version && ` (${plugin.pinned_version})`}
          </Text>
        )}
      </Stack>
      <Button
        variant="subtle"
        color="error"
        loading={isDeleting}
        onClick={handleDelete}
        leftSection={<Icon name="trash" />}
      >
        {t`Remove`}
      </Button>
    </Flex>
  );
}

function AddPluginForm({ onClose }: { onClose: () => void }) {
  const [createPlugin] = useCreateCustomVizPluginMutation();

  const handleSubmit = useCallback(
    async (values: {
      repo_url: string;
      display_name: string;
      access_token: string;
    }) => {
      await createPlugin({
        repo_url: values.repo_url,
        display_name: values.display_name,
        access_token: values.access_token || undefined,
      }).unwrap();
      onClose();
    },
    [createPlugin, onClose],
  );

  return (
    <Box
      p="lg"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mb-radius-md)",
      }}
    >
      <FormProvider
        initialValues={{ repo_url: "", display_name: "", access_token: "" }}
        onSubmit={handleSubmit}
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="md">
              <FormTextInput
                name="repo_url"
                label={t`Repository URL`}
                placeholder="https://github.com/user/custom-viz-plugin"
                autoFocus
              />
              <FormTextInput
                name="display_name"
                label={t`Display name`}
                placeholder={t`My Custom Visualization`}
              />
              <FormTextInput
                name="access_token"
                label={t`Access token (optional)`}
                description={
                  <Text c="text-tertiary" size="sm" component="span">
                    {t`Personal access token for private repositories`}
                  </Text>
                }
                type="password"
              />
              <FormErrorMessage />
              <Group gap="sm">
                <FormSubmitButton
                  label={t`Add plugin`}
                  disabled={!dirty}
                  variant="filled"
                />
                <Button variant="subtle" onClick={onClose}>
                  {t`Cancel`}
                </Button>
              </Group>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Box>
  );
}

export function CustomVizPluginsSettingsPage() {
  const { data: plugins, isLoading } = useListAllCustomVizPluginsQuery();
  const [deletePlugin] = useDeleteCustomVizPluginMutation();
  const [showAddForm, setShowAddForm] = useState(false);

  const handleDelete = useCallback(
    async (id: number) => {
      await deletePlugin(id).unwrap();
    },
    [deletePlugin],
  );

  return (
    <SettingsPageWrapper
      title={t`Custom visualization plugins`}
      description={t`Register Git repositories containing custom visualization bundles. Plugins provide additional chart types for your questions and dashboards.`}
    >
      <SettingsSection>
        <Stack gap="md">
          {!showAddForm && (
            <Box>
              <Button
                variant="filled"
                leftSection={<Icon name="add" />}
                onClick={() => setShowAddForm(true)}
              >
                {t`Add plugin`}
              </Button>
            </Box>
          )}

          {showAddForm && (
            <AddPluginForm onClose={() => setShowAddForm(false)} />
          )}

          {isLoading && (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          )}

          {plugins && plugins.length === 0 && !isLoading && (
            <Text c="text-tertiary">{t`No plugins registered yet.`}</Text>
          )}

          {plugins?.map(plugin => (
            <PluginListItem
              key={plugin.id}
              plugin={plugin}
              onDelete={handleDelete}
            />
          ))}
        </Stack>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
