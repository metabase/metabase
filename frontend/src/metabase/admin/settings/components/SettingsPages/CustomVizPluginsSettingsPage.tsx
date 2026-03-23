import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
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
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  Flex,
  Group,
  Icon,
  type IconName,
  Loader,
  Menu,
  Select,
  type SelectOption,
  Stack,
  Switch,
  Text,
  TextInput,
} from "metabase/ui";
import { iconNames } from "metabase/ui/components/icons/Icon/icons";
import type { CustomVizPlugin } from "metabase-types/api";

const DEFAULT_ICON: IconName = "area";

const ICON_OPTIONS: SelectOption[] = iconNames.map((name) => ({
  value: name,
  label: name,
  icon: name as IconName,
}));

function IconPreview({ iconName }: { iconName: IconName }) {
  return (
    <ActionIcon
      w="3.125rem"
      h="3.125rem"
      radius="xl"
      color="brand"
      variant="outline"
      style={{ border: "1px solid var(--mb-color-border)" }}
    >
      <Icon name={iconName} c="brand" size={20} />
    </ActionIcon>
  );
}

function IconPickerField({
  value,
  onChange,
}: {
  value: IconName | null;
  onChange: (icon: IconName | null) => void;
}) {
  return (
    <Box>
      <Text fw={700} size="sm" mb={4}>
        {t`Icon (optional)`}
      </Text>
      <Group gap="md" align="center">
        <Box style={{ flex: 1 }}>
          <Select
            data={ICON_OPTIONS}
            value={value}
            onChange={(val) => onChange((val as IconName) ?? null)}
            searchable
            clearable
            placeholder={t`From manifest or default`}
          />
        </Box>
        {value && <IconPreview iconName={value} />}
      </Group>
    </Box>
  );
}

function PluginForm({
  plugin,
  onClose,
}: {
  plugin?: CustomVizPlugin;
  onClose: () => void;
}) {
  const [createPlugin] = useCreateCustomVizPluginMutation();
  const [updatePlugin] = useUpdateCustomVizPluginMutation();
  const isEdit = Boolean(plugin);

  const [selectedIcon, setSelectedIcon] = useState<IconName | null>(
    isEdit ? ((plugin?.icon as IconName) ?? DEFAULT_ICON) : null,
  );

  const initialValues = useMemo(
    () => ({
      repo_url: plugin?.repo_url ?? "",
      display_name: plugin?.display_name ?? "",
      access_token: "",
      pinned_version: plugin?.pinned_version ?? "",
    }),
    [plugin],
  );

  const handleSubmit = useCallback(
    async (values: {
      repo_url: string;
      display_name: string;
      access_token: string;
      pinned_version: string;
    }) => {
      const icon = selectedIcon === DEFAULT_ICON ? null : selectedIcon;

      if (isEdit && plugin) {
        await updatePlugin({
          id: plugin.id,
          display_name: values.display_name,
          icon: icon ?? null,
          access_token: values.access_token || undefined,
          pinned_version: values.pinned_version || null,
        }).unwrap();
      } else {
        await createPlugin({
          repo_url: values.repo_url,
          // Only send display_name/icon if explicitly set — otherwise
          // the backend will use values from the plugin manifest.
          display_name: values.display_name || undefined,
          icon: icon ?? undefined,
          access_token: values.access_token || undefined,
          pinned_version: values.pinned_version || null,
        }).unwrap();
      }
      onClose();
    },
    [createPlugin, updatePlugin, plugin, isEdit, selectedIcon, onClose],
  );

  return (
    <Box
      p="lg"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mb-radius-md)",
      }}
    >
      <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
        {({ dirty }) => (
          <Form>
            <Stack gap="lg">
              <Stack gap="md">
                <Text fw={700}>{t`Git settings`}</Text>
                <FormTextInput
                  name="repo_url"
                  label={t`Repository URL`}
                  placeholder="https://github.com/user/custom-viz-plugin"
                  disabled={isEdit}
                  autoFocus={!isEdit}
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
                <FormTextInput
                  name="pinned_version"
                  label={t`Pinned version (optional)`}
                  description={
                    <Text c="text-tertiary" size="sm" component="span">
                      {t`Branch, tag, or commit SHA to pin to`}
                    </Text>
                  }
                  placeholder="main"
                />
              </Stack>
              <Stack gap="md">
                <Text fw={700}>{t`Customization`}</Text>
                {!isEdit && (
                  <Text size="sm" c="text-tertiary">
                    {t`These fields are optional. If the plugin includes a manifest file, its name and icon will be used automatically.`}
                  </Text>
                )}
                <FormTextInput
                  name="display_name"
                  label={isEdit ? t`Display name` : t`Display name (optional)`}
                  placeholder={
                    plugin?.manifest?.name ?? t`From manifest or repo name`
                  }
                  autoFocus={isEdit}
                />
                <IconPickerField
                  value={selectedIcon}
                  onChange={setSelectedIcon}
                />
              </Stack>
              <FormErrorMessage />
              <Group gap="sm">
                <FormSubmitButton
                  label={isEdit ? t`Update plugin` : t`Add plugin`}
                  disabled={
                    !dirty &&
                    selectedIcon ===
                      (isEdit
                        ? ((plugin?.icon as IconName) ?? DEFAULT_ICON)
                        : null)
                  }
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

function PluginListItem({
  plugin,
  onDelete,
  onEdit,
}: {
  plugin: CustomVizPlugin;
  onDelete: (id: number) => void;
  onEdit: (plugin: CustomVizPlugin) => void;
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
      justify="space-between"
      align="center"
      p="md"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mb-radius-md)",
      }}
    >
      <Group gap="md" align="flex-start">
        <IconPreview iconName={(plugin.icon as IconName) ?? DEFAULT_ICON} />
        <Stack gap="xs">
          <Text fw={700}>{plugin.display_name}</Text>
          <Text
            component="a"
            href={plugin.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            c="text-tertiary"
            td="underline"
          >
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
          {(plugin.min_metabase_version != null ||
              plugin.max_metabase_version != null) && (
            <Text size="sm" c="text-tertiary">
              {t`Metabase version`}:{" "}
              {plugin.min_metabase_version != null &&
              plugin.max_metabase_version != null
                ? `v${plugin.min_metabase_version} – v${plugin.max_metabase_version}`
                : plugin.min_metabase_version != null
                  ? `v${plugin.min_metabase_version}+`
                  : `up to v${plugin.max_metabase_version}`}
            </Text>
          )}
        </Stack>
      </Group>
      <Group gap="sm">
        <Switch
          checked={plugin.enabled}
          onChange={handleToggleEnabled}
          label={plugin.enabled ? t`Enabled` : t`Disabled`}
          size="sm"
        />
        <Menu>
          <Menu.Target>
            <Button
              variant="subtle"
              p="xs"
              loading={isRefreshing || isDeleting}
            >
              <Icon name="ellipsis" />
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="pencil" />}
              onClick={() => onEdit(plugin)}
            >
              {t`Edit`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="refresh" />}
              onClick={handleRefresh}
            >
              {t`Refetch`}
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
      </Group>
    </Flex>
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
      <Button
        variant="filled"
        size="sm"
        onClick={handleSave}
        loading={isLoading}
      >
        {saved ? t`Saved` : t`Save`}
      </Button>
      {plugin.dev_bundle_url && (
        <Button variant="subtle" size="sm" onClick={handleClear}>
          {t`Clear`}
        </Button>
      )}
    </Flex>
  );
}

function DevelopmentSection({ plugins }: { plugins: CustomVizPlugin[] }) {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <Box
      mt="xl"
      p="md"
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: "var(--mb-radius-md)",
      }}
    >
      <Group
        gap="xs"
        onClick={toggle}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <Icon
          name="chevronright"
          size={12}
          style={{
            transform: opened ? "rotate(90deg)" : undefined,
            transition: "transform 150ms ease",
          }}
        />
        <Text fw={700}>{t`Development`}</Text>
      </Group>
      <Collapse in={opened}>
        <Stack gap="md" mt="md">
          <Text size="sm" c="text-tertiary">
            {t`Set dev bundle URLs to load plugin code from a local dev server instead of the stored bundle. Changes take effect on the next page reload.`}
          </Text>
          {plugins.map((plugin) => (
            <DevUrlItem key={plugin.id} plugin={plugin} />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

export function CustomVizPluginsSettingsPage() {
  const { data: plugins, isLoading } = useListAllCustomVizPluginsQuery();
  const [deletePlugin] = useDeleteCustomVizPluginMutation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlugin, setEditingPlugin] = useState<CustomVizPlugin | null>(
    null,
  );

  const handleDelete = useCallback(
    async (id: number) => {
      await deletePlugin(id).unwrap();
    },
    [deletePlugin],
  );

  const handleEdit = useCallback((plugin: CustomVizPlugin) => {
    setShowAddForm(false);
    setEditingPlugin(plugin);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowAddForm(false);
    setEditingPlugin(null);
  }, []);

  return (
    <SettingsPageWrapper
      title={t`Custom visualization plugins`}
      description={t`Register Git repositories containing custom visualization bundles. Plugins provide additional chart types for your questions and dashboards.`}
    >
      <SettingsSection>
        <Stack gap="md">
          {!showAddForm && !editingPlugin && (
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

          {showAddForm && <PluginForm onClose={handleCloseForm} />}

          {editingPlugin && (
            <PluginForm plugin={editingPlugin} onClose={handleCloseForm} />
          )}

          {isLoading && (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          )}

          {plugins && plugins.length === 0 && !isLoading && (
            <Text c="text-tertiary">{t`No plugins registered yet.`}</Text>
          )}

          {plugins
            ?.filter((plugin) => plugin.id !== editingPlugin?.id)
            .map((plugin) => (
              <PluginListItem
                key={plugin.id}
                plugin={plugin}
                onDelete={handleDelete}
                onEdit={handleEdit}
              />
            ))}
        </Stack>

        {plugins && plugins.length > 0 && (
          <DevelopmentSection plugins={plugins} />
        )}
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
