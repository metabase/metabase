import { useDebouncedCallback, useDisclosure } from "@mantine/hooks";
import { useFormik } from "formik";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  useCreateAppMutation,
  useDeleteAppMutation,
  useGetAppQuery,
  useGetCollectionQuery,
  useUpdateAppMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { useSetting } from "metabase/common/hooks";
import { useToast } from "metabase/common/hooks/use-toast";
import { useRouter } from "metabase/router";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Collapse,
  Divider,
  Flex,
  Group,
  Input,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

const MB = 1024 * 1024;
const IMAGE_SIZE_LIMIT = 2 * MB;

/** Theme color configuration keys */
const THEME_COLOR_KEYS = [
  "brand",
  "text-primary",
  "text-secondary",
  "background",
  "background-hover",
  "border",
  "positive",
  "negative",
] as const;

function getColorLabel(key: string): string {
  switch (key) {
    case "brand":
      return t`Brand`;
    case "text-primary":
      return t`Text Primary`;
    case "text-secondary":
      return t`Text Secondary`;
    case "background":
      return t`Background`;
    case "background-hover":
      return t`Background Hover`;
    case "border":
      return t`Border`;
    case "positive":
      return t`Positive`;
    case "negative":
      return t`Negative`;
    default:
      return key;
  }
}

interface ThemeConfig {
  preset?: "light" | "dark";
  fontFamily?: string;
  colors?: Record<string, string>;
}

interface AppFormValues {
  name: string;
  auth_method: "jwt" | "saml";
  collection_id: number;
  theme: string;
  logo: string | null;
}

function useAuthMethodOptions() {
  const jwtEnabled = useSetting("jwt-enabled");
  const samlEnabled = useSetting("saml-enabled");

  const data = [
    { value: "jwt", label: "JWT", disabled: !jwtEnabled },
    { value: "saml", label: "SAML", disabled: !samlEnabled },
  ];

  const noneEnabled = !jwtEnabled && !samlEnabled;

  return { data, noneEnabled };
}

export function AppForm() {
  const { params, router } = useRouter();
  const idParam = params?.id as string | undefined;
  const id = idParam ? parseInt(idParam, 10) : undefined;
  const isEditing = id !== undefined;
  const [createApp] = useCreateAppMutation();
  const [updateApp] = useUpdateAppMutation();
  const [deleteApp] = useDeleteAppMutation();
  const [sendToast] = useToast();

  const {
    data: existingApp,
    isLoading,
    error,
  } = useGetAppQuery(id!, {
    skip: !isEditing,
  });

  const formik = useFormik<AppFormValues>({
    initialValues: {
      name: "",
      auth_method: "jwt",
      collection_id: 0,
      theme: "",
      logo: null,
    },
    validate: (values) => {
      const errors: Partial<Record<keyof AppFormValues, string>> = {};
      if (!values.name.trim()) {
        errors.name = t`Name is required`;
      }
      if (!values.collection_id) {
        errors.collection_id = t`Collection is required`;
      }
      return errors;
    },
    onSubmit: async (values) => {
      const payload = {
        name: values.name,
        auth_method: values.auth_method,
        collection_id: values.collection_id,
        theme: values.theme || null,
        logo: values.logo || null,
      };

      if (isEditing) {
        await updateApp({ id: id!, ...payload });
      } else {
        await createApp(payload);
      }
      router.push("/admin/apps");
    },
  });

  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (existingApp) {
      formik.resetForm({
        values: {
          name: existingApp.name,
          auth_method: existingApp.auth_method,
          collection_id: existingApp.collection_id,
          theme: existingApp.theme ?? "",
          logo: existingApp.logo ?? null,
        },
      });
      initialLoadDone.current = true;
    }
    // We only want to run this once when the app loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingApp]);

  // Auto-save with debounce
  const debouncedSave = useDebouncedCallback(async (values: AppFormValues) => {
    const payload = {
      name: values.name,
      auth_method: values.auth_method,
      collection_id: values.collection_id,
      theme: values.theme || null,
      logo: values.logo || null,
    };

    if (isEditing && id) {
      await updateApp({ id, ...payload });
      sendToast({ message: t`Saved` });
    }
  }, 1000);

  useEffect(() => {
    // Only auto-save after initial load and when form is dirty
    if (
      isEditing &&
      initialLoadDone.current &&
      formik.dirty &&
      formik.isValid
    ) {
      debouncedSave(formik.values);
    }
  }, [formik.values, formik.dirty, formik.isValid, isEditing, debouncedSave]);

  const handleDelete = useCallback(async () => {
    await deleteApp(id!);
    router.push("/admin/apps");
  }, [deleteApp, id, router]);

  if (isEditing) {
    return (
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <AppFormContent
          formik={formik}
          isEditing={isEditing}
          appName={existingApp?.name ?? ""}
          onDelete={handleDelete}
        />
      </LoadingAndErrorWrapper>
    );
  }

  return (
    <AppFormContent
      formik={formik}
      isEditing={isEditing}
      appName=""
      onDelete={null}
    />
  );
}

function AppFormContent({
  formik,
  isEditing,
  appName,
  onDelete,
}: {
  formik: ReturnType<typeof useFormik<AppFormValues>>;
  isEditing: boolean;
  appName: string;
  onDelete: (() => Promise<void>) | null;
}) {
  const [pickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure(false);
  const [
    deleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure(false);

  const collectionId = formik.values.collection_id;
  const { data: collection } = useGetCollectionQuery(
    { id: collectionId },
    { skip: !collectionId },
  );

  const { data: authMethodData, noneEnabled: noAuthEnabled } =
    useAuthMethodOptions();

  return (
    <Stack p="lg" maw="40rem" gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>{isEditing ? t`Edit App` : t`Create App`}</Title>
        {isEditing && appName && (
          <Button
            component="a"
            href={`/apps/${encodeURIComponent(appName)}?useCurrentSession=true`}
            target="_blank"
            variant="outline"
          >
            {t`Preview`}
          </Button>
        )}
      </Group>
      <form onSubmit={formik.handleSubmit}>
        <Stack gap="md">
          <TextInput
            label={t`Name`}
            required
            {...formik.getFieldProps("name")}
          />
          <Select
            label={t`Auth Method`}
            required
            data={authMethodData}
            value={formik.values.auth_method}
            onChange={(value) =>
              formik.setFieldValue("auth_method", value ?? "jwt")
            }
          />
          {noAuthEnabled && (
            <Alert variant="light" color="warning">
              {t`No authentication method is configured.`}{" "}
              <Anchor href="/admin/settings/authentication">
                {t`Configure JWT or SAML in authentication settings.`}
              </Anchor>
            </Alert>
          )}
          <Stack gap={4}>
            <Input.Label required>{t`Collection`}</Input.Label>
            {collectionId ? (
              <Group gap="xs">
                <Text>{collection?.name ?? "…"}</Text>
                <Anchor onClick={openPicker}>{t`Change collection`}</Anchor>
              </Group>
            ) : (
              <Anchor onClick={openPicker}>{t`Select a collection`}</Anchor>
            )}
            {formik.touched.collection_id && formik.errors.collection_id && (
              <Text size="xs" c="error">
                {formik.errors.collection_id}
              </Text>
            )}
          </Stack>
          {pickerOpened && (
            <CollectionPickerModal
              value={
                collectionId
                  ? { id: collectionId, model: "collection" }
                  : undefined
              }
              onChange={(item) => {
                formik.setFieldValue("collection_id", item.id);
                closePicker();
              }}
              onClose={closePicker}
            />
          )}
          <ThemeEditor
            value={formik.values.theme}
            onChange={(theme) => formik.setFieldValue("theme", theme)}
          />
          <LogoUploadField
            value={formik.values.logo}
            onChange={(logo) => formik.setFieldValue("logo", logo)}
          />
          <Divider mt="md" />
          <Group justify="flex-end">
            {onDelete ? (
              <Button color="error" variant="subtle" onClick={openDeleteModal}>
                {t`Delete app`}
              </Button>
            ) : (
              <Button type="submit" variant="filled">
                {t`Create`}
              </Button>
            )}
          </Group>
          {onDelete && (
            <ConfirmModal
              opened={deleteModalOpened}
              title={t`Delete this app?`}
              message={t`This will permanently delete the app and cannot be undone.`}
              confirmButtonText={t`Delete`}
              confirmButtonProps={{ color: "error" }}
              onConfirm={onDelete}
              onClose={closeDeleteModal}
            />
          )}
        </Stack>
      </form>
    </Stack>
  );
}

function LogoUploadField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (logo: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    setErrorMessage("");
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > IMAGE_SIZE_LIMIT) {
      setErrorMessage(
        t`The image you chose is larger than 2MB. Please choose another one.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = async (readerEvent) => {
      const dataUri = readerEvent.target?.result as string;
      if (!(await isImageIntact(dataUri))) {
        setErrorMessage(
          t`The image you chose is corrupted. Please choose another one.`,
        );
        return;
      }
      setFileName(file.name);
      onChange(dataUri);
    };
    reader.readAsDataURL(file);
  }

  function handleRemove() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFileName("");
    setErrorMessage("");
    onChange(null);
  }

  return (
    <Stack gap={4}>
      <Input.Label>{t`Logo`}</Input.Label>
      {errorMessage && (
        <Text size="xs" c="error">
          {errorMessage}
        </Text>
      )}
      <Paper withBorder shadow="none">
        <Flex>
          <Flex
            align="center"
            justify="center"
            w="7.5rem"
            style={{ borderRight: "1px solid var(--mb-color-border)" }}
          >
            {value && (
              <img
                src={value}
                alt={t`Logo preview`}
                style={{
                  maxWidth: "6rem",
                  maxHeight: "4rem",
                  objectFit: "contain",
                }}
              />
            )}
          </Flex>
          <Flex p="md" gap="sm" align="center" style={{ flex: 1 }}>
            <Button
              size="compact-md"
              variant="default"
              onClick={() => fileInputRef.current?.click()}
            >
              {t`Choose file`}
            </Button>
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/svg+xml"
              multiple={false}
              onChange={handleFileUpload}
            />
            <Text size="sm" c="text-medium" truncate style={{ flex: 1 }}>
              {fileName || (value ? t`Logo uploaded` : t`No file chosen`)}
            </Text>
            {value && (
              <Anchor size="sm" onClick={handleRemove}>
                {t`Remove`}
              </Anchor>
            )}
          </Flex>
        </Flex>
      </Paper>
    </Stack>
  );
}

async function isImageIntact(dataUri: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = document.createElement("img");
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = dataUri;
  });
}

function ThemeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (theme: string) => void;
}) {
  const [colorsOpened, { toggle: toggleColors }] = useDisclosure(false);

  // Parse current theme value
  const themeConfig = useMemo<ThemeConfig>(() => {
    if (!value) {
      return {};
    }
    try {
      return JSON.parse(value) as ThemeConfig;
    } catch {
      return {};
    }
  }, [value]);

  const updateTheme = useCallback(
    (updates: Partial<ThemeConfig>) => {
      const newConfig = { ...themeConfig, ...updates };

      // Clean up empty values
      if (!newConfig.preset) {
        delete newConfig.preset;
      }
      if (!newConfig.fontFamily) {
        delete newConfig.fontFamily;
      }
      if (newConfig.colors && Object.keys(newConfig.colors).length === 0) {
        delete newConfig.colors;
      }

      if (Object.keys(newConfig).length === 0) {
        onChange("");
      } else {
        onChange(JSON.stringify(newConfig, null, 2));
      }
    },
    [themeConfig, onChange],
  );

  const updateColor = useCallback(
    (key: string, colorValue: string) => {
      const newColors = { ...themeConfig.colors };
      if (colorValue) {
        newColors[key] = colorValue;
      } else {
        delete newColors[key];
      }
      updateTheme({ colors: newColors });
    },
    [themeConfig.colors, updateTheme],
  );

  const hasCustomColors =
    themeConfig.colors && Object.keys(themeConfig.colors).length > 0;

  return (
    <Stack gap="sm">
      <Input.Label>{t`Theme`}</Input.Label>

      <Select
        label={t`Preset`}
        placeholder={t`Select preset`}
        clearable
        data={[
          { value: "light", label: t`Light` },
          { value: "dark", label: t`Dark` },
        ]}
        value={themeConfig.preset ?? null}
        onChange={(preset) =>
          updateTheme({ preset: (preset as "light" | "dark") || undefined })
        }
      />

      <TextInput
        label={t`Font Family`}
        placeholder="Lato, sans-serif"
        value={themeConfig.fontFamily ?? ""}
        onChange={(e) =>
          updateTheme({ fontFamily: e.target.value || undefined })
        }
      />

      <Box>
        <Anchor size="sm" onClick={toggleColors}>
          {colorsOpened ? t`Hide color settings` : t`Customize colors`}
          {hasCustomColors && ` (${Object.keys(themeConfig.colors!).length})`}
        </Anchor>
      </Box>

      <Collapse in={colorsOpened}>
        <Paper withBorder p="md">
          <Stack gap="sm">
            {THEME_COLOR_KEYS.map((key) => (
              <Group key={key} gap="xs" align="flex-end">
                <TextInput
                  label={getColorLabel(key)}
                  placeholder="#509EE3"
                  style={{ flex: 1 }}
                  value={themeConfig.colors?.[key] ?? ""}
                  onChange={(e) => updateColor(key, e.target.value)}
                />
                <input
                  type="color"
                  value={themeConfig.colors?.[key] || "#509EE3"}
                  onChange={(e) => updateColor(key, e.target.value)}
                  style={{
                    width: 36,
                    height: 36,
                    padding: 0,
                    border: "1px solid var(--mb-color-border)",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                />
              </Group>
            ))}
          </Stack>
        </Paper>
      </Collapse>

      {value && (
        <Paper withBorder p="xs" bg="bg-light">
          <Text size="xs" c="text-medium" style={{ fontFamily: "monospace" }}>
            {value}
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
