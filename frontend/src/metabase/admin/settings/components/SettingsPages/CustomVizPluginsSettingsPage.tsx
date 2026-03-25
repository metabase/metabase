import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import {
  useCreateCustomVizPluginMutation,
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
  Title,
} from "metabase/ui";
import { getPluginAssetUrl } from "metabase/visualizations/custom-viz-plugins";
import type { CustomVizPlugin } from "metabase-types/api";

import S from "./CustomVizPluginsSettingsPage.module.css";

const BASE_PATH = "/admin/settings/custom-visualizations";

function PluginIconPreview({ plugin }: { plugin: CustomVizPlugin }) {
  const iconUrl = getPluginAssetUrl(plugin.id, plugin.icon);
  const dimmed = !plugin.enabled;
  return (
    <ActionIcon
      w="3.125rem"
      h="3.125rem"
      radius="xl"
      variant="outline"
      c={dimmed ? "text-secondary" : undefined}
      style={{
        border: "1px solid var(--mb-color-border)",
        opacity: dimmed ? 0.6 : undefined,
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
        <Icon name="unknown" size={20} />
      )}
    </ActionIcon>
  );
}

function PluginListItem({
  plugin,
  onDelete,
}: {
  plugin: CustomVizPlugin;
  onDelete: (id: number) => void;
}) {
  const dispatch = useDispatch();
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

  const handleClick = useCallback(() => {
    dispatch(push(`${BASE_PATH}/edit/${plugin.id}`));
  }, [dispatch, plugin.id]);

  return (
    <Flex
      justify="space-between"
      align="center"
      p="md"
      className={S.pluginListItem}
      onClick={handleClick}
    >
      <Group gap="md" align="center">
        <PluginIconPreview plugin={plugin} />
        <Stack gap={4}>
          <Text fw={700}>{plugin.display_name}</Text>
          <Group gap="xs">
            <Text
              component="a"
              href={plugin.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              c="text-tertiary"
              td="underline"
              onClick={(e) => e.stopPropagation()}
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
          </Group>
          {plugin.error_message && (
            <Text size="sm" c="error">
              {plugin.error_message}
            </Text>
          )}
        </Stack>
      </Group>
      <Box onClick={(e) => e.stopPropagation()}>
        <Menu>
          <Menu.Target>
            <ActionIcon variant="subtle" loading={isRefreshing || isDeleting}>
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="refresh" />}
              onClick={handleRefresh}
            >
              {t`Re-fetch`}
            </Menu.Item>
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
      description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
    >
      <Flex justify="space-between" align="center" mih="2.75rem">
        <Title
          order={1}
          h="2.75rem"
          display="flex"
          style={{ alignItems: "center" }}
        >{t`Manage custom visualizations`}</Title>
        <Button
          component={Link}
          to={`${BASE_PATH}/new`}
          variant="filled"
          leftSection={<Icon name="add" />}
        >
          {t`Add visualization`}
        </Button>
      </Flex>

      <SettingsSection>
        {isLoading && (
          <Flex justify="center" p="xl">
            <Loader />
          </Flex>
        )}

        {plugins && plugins.length === 0 && !isLoading && (
          <Box
            p="xl"
            style={{
              borderRadius: "var(--mb-radius-md)",
              backgroundColor: "var(--mb-color-bg-white)",
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
            className={S.pluginList}
            style={{
              borderRadius: "var(--mb-radius-md)",
              backgroundColor: "var(--mb-color-bg-white)",
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
      </SettingsSection>
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
      description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
    >
      <Title
        order={1}
        h="2.75rem"
        display="flex"
        style={{ alignItems: "center" }}
      >{t`Manage custom visualizations`}</Title>

      <SettingsSection>
        <Box
          style={{
            borderRadius: "var(--mb-radius-md)",
            backgroundColor: "var(--mb-color-bg-white)",
          }}
        >
          <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
            {({ dirty }) => (
              <Form>
                <Stack gap="lg">
                  <Text fw={700} fz="xl">{t`Add a new chart`}</Text>
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

function DevUrlItem({ plugin }: { plugin: CustomVizPlugin }) {
  const [setDevUrl, { isLoading }] = useSetCustomVizPluginDevUrlMutation();
  const [url, setUrl] = useState(plugin.dev_bundle_url ?? "");
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    try {
      await setDevUrl({
        id: plugin.id,
        dev_bundle_url: url || null,
      }).unwrap();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error is handled by RTK Query
    }
  }, [plugin.id, url, setDevUrl]);

  const handleClear = useCallback(async () => {
    try {
      setUrl("");
      await setDevUrl({
        id: plugin.id,
        dev_bundle_url: null,
      }).unwrap();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error is handled by RTK Query
    }
  }, [plugin.id, setDevUrl]);

  return (
    <Box>
      <Flex gap="sm" align="flex-end">
        <Box style={{ flex: 1 }}>
          <TextInput
            label={plugin.display_name}
            placeholder="http://localhost:5174"
            value={url}
            onChange={(e) => {
              setUrl(e.currentTarget.value);
              setSaved(false);
            }}
          />
        </Box>
        {url && url !== (plugin.dev_bundle_url ?? "") && (
          <Button
            variant="filled"
            size="sm"
            onClick={handleSave}
            loading={isLoading}
          >
            {saved ? t`Saved` : t`Save`}
          </Button>
        )}
        {plugin.dev_bundle_url && (
          <ActionIcon variant="subtle" size="lg" onClick={handleClear}>
            <Icon name="trash" />
          </ActionIcon>
        )}
      </Flex>
    </Box>
  );
}

export function CustomVizDevelopmentPage() {
  const { data: plugins, isLoading } = useListAllCustomVizPluginsQuery();

  return (
    <SettingsPageWrapper
      description={t`Set dev bundle URLs to load plugin code from a local dev server instead of the stored bundle. Changes take effect on the next page reload.`}
    >
      <Title
        order={1}
        h="2.75rem"
        display="flex"
        style={{ alignItems: "center" }}
      >{t`Development`}</Title>

      <SettingsSection>
        {isLoading && (
          <Flex justify="center" p="xl">
            <Loader />
          </Flex>
        )}

        {plugins && plugins.length === 0 && !isLoading && (
          <Text c="text-tertiary">{t`Register custom visualizations first to configure dev URLs.`}</Text>
        )}

        {plugins && plugins.length > 0 && (
          <Box
            className={S.devUrlList}
            p="md"
            style={{
              borderRadius: "var(--mb-radius-md)",
              backgroundColor: "var(--mb-color-bg-white)",
            }}
          >
            {plugins.map((plugin) => (
              <DevUrlItem key={plugin.id} plugin={plugin} />
            ))}
          </Box>
        )}
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
