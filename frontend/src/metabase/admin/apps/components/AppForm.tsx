import { useDisclosure } from "@mantine/hooks";
import { useFormik } from "formik";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import {
  useCreateAppMutation,
  useGetAppQuery,
  useGetCollectionQuery,
  useUpdateAppMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { useSetting } from "metabase/common/hooks";
import { useRouter } from "metabase/router";
import {
  Alert,
  Anchor,
  Button,
  Flex,
  Group,
  Input,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "metabase/ui";

const MB = 1024 * 1024;
const IMAGE_SIZE_LIMIT = 2 * MB;

interface AppFormValues {
  name: string;
  auth_method: "jwt" | "saml";
  collection_id: number;
  theme: string;
  logo: string | null;
  published: boolean;
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
      published: false,
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
        published: values.published,
      };

      if (isEditing) {
        await updateApp({ id: id!, ...payload });
      } else {
        await createApp(payload);
      }
      router.push("/admin/apps");
    },
  });

  useEffect(() => {
    if (existingApp) {
      formik.setValues({
        name: existingApp.name,
        auth_method: existingApp.auth_method,
        collection_id: existingApp.collection_id,
        theme: existingApp.theme ?? "",
        logo: existingApp.logo ?? null,
        published: existingApp.published,
      });
    }
    // We only want to run this once when the app loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingApp]);

  const handleCancel = useCallback(() => {
    router.push("/admin/apps");
  }, [router]);

  if (isEditing) {
    return (
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <AppFormContent
          formik={formik}
          isEditing={isEditing}
          onCancel={handleCancel}
        />
      </LoadingAndErrorWrapper>
    );
  }

  return (
    <AppFormContent
      formik={formik}
      isEditing={isEditing}
      onCancel={handleCancel}
    />
  );
}

function AppFormContent({
  formik,
  isEditing,
  onCancel,
}: {
  formik: ReturnType<typeof useFormik<AppFormValues>>;
  isEditing: boolean;
  onCancel: () => void;
}) {
  const [pickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure(false);

  const collectionId = formik.values.collection_id;
  const { data: collection } = useGetCollectionQuery(
    { id: collectionId },
    { skip: !collectionId },
  );

  const { data: authMethodData, noneEnabled: noAuthEnabled } =
    useAuthMethodOptions();

  const canPublish =
    !!formik.values.name.trim() && !!collectionId && !noAuthEnabled;

  return (
    <Stack p="lg" maw="40rem" gap="lg">
      <Title order={2}>{isEditing ? t`Edit App` : t`Create App`}</Title>
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
          <Textarea
            label={t`Theme`}
            autosize
            minRows={4}
            maxRows={12}
            styles={{ input: { fontFamily: "monospace" } }}
            {...formik.getFieldProps("theme")}
          />
          <LogoUploadField
            value={formik.values.logo}
            onChange={(logo) => formik.setFieldValue("logo", logo)}
          />
          <Switch
            label={t`Published`}
            disabled={!canPublish}
            checked={formik.values.published}
            onChange={(e) =>
              formik.setFieldValue("published", e.currentTarget.checked)
            }
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onCancel}>
              {t`Cancel`}
            </Button>
            <Button type="submit" variant="filled">
              {isEditing ? t`Save` : t`Create`}
            </Button>
          </Group>
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
