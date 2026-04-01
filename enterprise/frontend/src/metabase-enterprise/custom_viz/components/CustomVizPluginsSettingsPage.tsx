import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  useCreateCustomVizPluginMutation,
  useCreateDevCustomVizPluginMutation,
  useDeleteCustomVizPluginMutation,
  useListAllCustomVizPluginsQuery,
  useRefreshCustomVizPluginMutation,
  useSetCustomVizPluginDevUrlMutation,
  useUpdateCustomVizPluginMutation,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useDispatch } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  Menu,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { CustomVizPlugin } from "metabase-types/api";

import { getPluginAssetUrl } from "../custom-viz-plugins";

import S from "./CustomVizPluginsSettingsPage.module.css";

const BASE_PATH = "/admin/settings/custom-visualizations";

function PluginIconPreview({ plugin }: { plugin: CustomVizPlugin }) {
  const iconUrl = getPluginAssetUrl(plugin.id, plugin.icon);
  const dimmed = !plugin.enabled;
  return (
    <Flex
      w="3.125rem"
      h="3.125rem"
      align="center"
      justify="center"
      style={{
        borderRadius: "var(--mantine-radius-xl)",
        border: "1px solid var(--mb-color-border)",
        opacity: dimmed ? 0.6 : undefined,
        flexShrink: 0,
      }}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt={plugin.display_name}
          width={20}
          height={20}
          style={dimmed ? { filter: "grayscale(1)", opacity: 0.6 } : undefined}
        />
      ) : (
        <Icon
          name="unknown"
          size={20}
          c={dimmed ? "text-secondary" : undefined}
        />
      )}
    </Flex>
  );
}

function PluginListItem({
  plugin,
  onDelete,
}: {
  plugin: CustomVizPlugin;
  onDelete: (id: number) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatePlugin] = useUpdateCustomVizPluginMutation();
  const [refreshPlugin, { isLoading: isRefreshing }] =
    useRefreshCustomVizPluginMutation();

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(plugin.id);
    } finally {
      setIsDeleting(false);
    }
  }, [plugin.id, onDelete]);

  const handleToggleEnabled = useCallback(async () => {
    await updatePlugin({ id: plugin.id, enabled: !plugin.enabled });
  }, [plugin.id, plugin.enabled, updatePlugin]);

  const handleRefresh = useCallback(async () => {
    await refreshPlugin(plugin.id);
  }, [plugin.id, refreshPlugin]);

  return (
    <Flex
      component={Link}
      to={`${BASE_PATH}/edit/${plugin.id}`}
      justify="space-between"
      align="center"
      p="md"
      className={S.pluginListItem}
    >
      <Group gap="md" align="center">
        <PluginIconPreview plugin={plugin} />
        <Stack gap={4}>
          <Text fw={700}>{plugin.display_name}</Text>
          <Group gap="xs">
            {plugin.dev_only ? (
              <>
                <Text size="sm" c="brand" fw={600}>
                  {t`Dev mode`}
                </Text>
                {plugin.dev_bundle_url && (
                  <>
                    <Text size="sm" c="text-tertiary">
                      &bull;
                    </Text>
                    <Text size="sm" c="text-tertiary">
                      {plugin.dev_bundle_url}
                    </Text>
                  </>
                )}
              </>
            ) : (
              <>
                <Text
                  component="a"
                  href={plugin.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="sm"
                  c="text-tertiary"
                  td="underline"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  {plugin.repo_url}
                </Text>
                {plugin.resolved_commit && (
                  <>
                    <Text size="sm" c="text-tertiary">
                      &bull;
                    </Text>
                    <Text size="sm" c="text-tertiary">
                      {t`Commit`}: {plugin.resolved_commit.slice(0, 8)}
                    </Text>
                  </>
                )}
              </>
            )}
          </Group>
          {plugin.error_message && (
            <Text size="sm" c="error">
              {plugin.error_message}
            </Text>
          )}
        </Stack>
      </Group>
      <Box
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Menu>
          <Menu.Target>
            <ActionIcon variant="subtle" loading={isRefreshing || isDeleting}>
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {!plugin.dev_only && (
              <Menu.Item
                leftSection={<Icon name="refresh" />}
                onClick={handleRefresh}
              >
                {t`Re-fetch`}
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<Icon name={plugin.enabled ? "stop" : "play"} />}
              onClick={handleToggleEnabled}
            >
              {plugin.enabled ? t`Disable` : t`Enable`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="trash" />}
              color="error"
              onClick={handleDelete}
            >
              {t`Remove`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>
    </Flex>
  );
}

export function ManageCustomVisualizationsPage() {
  const { data: plugins, isLoading } = useListAllCustomVizPluginsQuery();
  const [deletePlugin] = useDeleteCustomVizPluginMutation();

  const handleDelete = useCallback(
    async (id: number) => {
      await deletePlugin(id).unwrap();
    },
    [deletePlugin],
  );

  return (
    <SettingsPageWrapper
      title={t`Manage custom visualizations`}
      description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
    >
      <Flex justify="flex-end">
        <Button
          component={Link}
          to={`${BASE_PATH}/new`}
          variant="filled"
          leftSection={<Icon name="add" />}
        >
          {t`Add visualization`}
        </Button>
      </Flex>

      {isLoading && (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      )}

      {plugins && plugins.length === 0 && !isLoading && (
        <Box
          bdrs="md"
          bg="background-primary"
          p="xl"
          style={{
            minHeight: "20rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text c="text-tertiary">{t`You don't have any custom visualizations.`}</Text>
        </Box>
      )}

      {plugins && plugins.length > 0 && (
        <Box
          bdrs="md"
          bg="background-primary"
          className={S.pluginList}
          style={{
            overflow: "hidden",
          }}
        >
          {plugins.map((plugin) => (
            <PluginListItem
              key={plugin.id}
              plugin={plugin}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      )}
    </SettingsPageWrapper>
  );
}

export function CustomVizFormPage({ params }: { params?: { id?: string } }) {
  const dispatch = useDispatch();
  const pluginId = params?.id ? parseInt(params.id, 10) : undefined;
  const { data: plugins } = useListAllCustomVizPluginsQuery();
  const plugin = pluginId ? plugins?.find((p) => p.id === pluginId) : undefined;
  const isEdit = pluginId != null;

  const [createPlugin] = useCreateCustomVizPluginMutation();
  const [updatePlugin] = useUpdateCustomVizPluginMutation();

  const initialValues = useMemo(
    () => ({
      repo_url: plugin?.repo_url ?? "",
      access_token: "",
      pinned_version: plugin?.pinned_version ?? "",
    }),
    [plugin],
  );

  const handleSubmit = useCallback(
    async (values: {
      repo_url: string;
      access_token: string;
      pinned_version: string;
    }) => {
      if (isEdit && plugin) {
        await updatePlugin({
          id: plugin.id,
          access_token: values.access_token || undefined,
          pinned_version: values.pinned_version || null,
        }).unwrap();
      } else {
        await createPlugin({
          repo_url: values.repo_url,
          access_token: values.access_token || undefined,
          pinned_version: values.pinned_version || null,
        }).unwrap();
      }
      dispatch(push(BASE_PATH));
    },
    [createPlugin, updatePlugin, plugin, isEdit, dispatch],
  );

  const handleCancel = useCallback(() => {
    dispatch(push(BASE_PATH));
  }, [dispatch]);

  if (isEdit && !plugin && plugins) {
    dispatch(push(BASE_PATH));
    return null;
  }

  return (
    <SettingsPageWrapper
      title={t`Manage custom visualizations`}
      description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
    >
      <SettingsSection>
        <Box bdrs="md" bg="background-primary">
          <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
            {({ dirty }) => (
              <Form>
                <Stack gap="lg">
                  <Text fw={700} fz="xl">
                    {isEdit
                      ? t`Edit visualization`
                      : t`Add a new visualization`}
                  </Text>
                  <FormTextInput
                    name="repo_url"
                    label={t`Repository URL`}
                    description={t`The location of the git repository where your visualization bundle is.`}
                    placeholder="https://github.com/user/custom-viz-plugin"
                    disabled={isEdit}
                    autoFocus={!isEdit}
                  />
                  <FormTextInput
                    name="access_token"
                    label={t`Repository access token (optional)`}
                    description={t`Personal access token for private repositories.`}
                    type="password"
                  />
                  <FormTextInput
                    name="pinned_version"
                    label={t`Pinned version (optional)`}
                    description={t`Branch, tag, or commit SHA to pin to.`}
                    placeholder="main"
                  />
                  <FormErrorMessage />
                  <Group gap="sm" justify="flex-end">
                    <Button variant="default" onClick={handleCancel}>
                      {t`Cancel`}
                    </Button>
                    <FormSubmitButton
                      label={t`Save`}
                      disabled={!dirty}
                      variant="filled"
                    />
                  </Group>
                </Stack>
              </Form>
            )}
          </FormProvider>
        </Box>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}

function DevUrlItem({
  plugin,
  url,
  onChange,
}: {
  plugin: CustomVizPlugin;
  url: string;
  onChange: (pluginId: number, url: string) => void;
}) {
  return (
    <Stack gap="xs">
      <TextInput
        label={plugin.display_name}
        placeholder="http://localhost:5174"
        value={url}
        onChange={(e) => onChange(plugin.id, e.currentTarget.value)}
      />
    </Stack>
  );
}

function AddDevPluginForm() {
  const [createDevPlugin] = useCreateDevCustomVizPluginMutation();

  const handleSubmit = useCallback(
    async (values: { identifier: string; dev_bundle_url: string }) => {
      await createDevPlugin({
        identifier: values.identifier,
        dev_bundle_url: values.dev_bundle_url,
      }).unwrap();
    },
    [createDevPlugin],
  );

  return (
    <SettingsSection>
      <FormProvider
        initialValues={{ identifier: "", dev_bundle_url: "" }}
        onSubmit={handleSubmit}
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="lg">
              <Text fw={700} fz="lg">
                {t`Add a dev visualization`}
              </Text>
              <FormTextInput
                name="identifier"
                label={t`Identifier`}
                description={t`Unique identifier for this visualization (e.g. "my-heatmap").`}
                placeholder="my-custom-viz"
                autoFocus
              />
              <FormTextInput
                name="dev_bundle_url"
                label={t`Dev server URL`}
                description={t`URL of the local dev server serving the visualization bundle.`}
                placeholder="http://localhost:5174"
              />
              <FormErrorMessage />
              <Group justify="flex-end">
                <FormSubmitButton
                  label={t`Add`}
                  disabled={!dirty}
                  variant="filled"
                />
              </Group>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </SettingsSection>
  );
}

export function CustomVizDevelopmentPage() {
  const { data: plugins, isLoading } = useListAllCustomVizPluginsQuery();
  const [setDevUrl] = useSetCustomVizPluginDevUrlMutation();
  const [devUrls, setDevUrls] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const getUrl = (plugin: CustomVizPlugin) =>
    devUrls[plugin.id] ?? plugin.dev_bundle_url ?? "";

  const handleChange = useCallback((pluginId: number, url: string) => {
    setDevUrls((prev) => ({ ...prev, [pluginId]: url }));
  }, []);

  const hasChanges = plugins?.some((plugin) => {
    const current = devUrls[plugin.id];
    return current !== undefined && current !== (plugin.dev_bundle_url ?? "");
  });

  const handleSave = useCallback(async () => {
    if (!plugins) {
      return;
    }
    setIsSaving(true);
    try {
      await Promise.all(
        plugins
          .filter((plugin) => {
            const current = devUrls[plugin.id];
            return (
              current !== undefined && current !== (plugin.dev_bundle_url ?? "")
            );
          })
          .map((plugin) =>
            setDevUrl({
              id: plugin.id,
              dev_bundle_url: devUrls[plugin.id] || null,
            }).unwrap(),
          ),
      );
      setDevUrls({});
    } finally {
      setIsSaving(false);
    }
  }, [plugins, devUrls, setDevUrl]);

  return (
    <SettingsPageWrapper
      title={t`Development`}
      description={t`Set dev bundle URLs to load plugin code from a local dev server instead of the stored bundle. Changes take effect on the next page reload.`}
    >
      {isLoading && (
        <Flex justify="center" p="xl">
          <Loader />
        </Flex>
      )}

      <AddDevPluginForm />

      {plugins && plugins.length > 0 && (
        <SettingsSection>
          <Stack gap="lg">
            <Text fw={700} fz="lg">
              {t`Dev bundle URLs`}
            </Text>
            {plugins.map((plugin) => (
              <DevUrlItem
                key={plugin.id}
                plugin={plugin}
                url={getUrl(plugin)}
                onChange={handleChange}
              />
            ))}
            <Group justify="flex-end">
              <Button
                variant="filled"
                onClick={handleSave}
                loading={isSaving}
                disabled={!hasChanges}
              >
                {t`Save`}
              </Button>
            </Group>
          </Stack>
        </SettingsSection>
      )}
    </SettingsPageWrapper>
  );
}
