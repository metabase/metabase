import { useDisclosure } from "@mantine/hooks";
import { useFormik } from "formik";
import { useCallback, useEffect } from "react";
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
  Group,
  Input,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "metabase/ui";

interface AppFormValues {
  name: string;
  auth_method: "jwt" | "saml";
  collection_id: number;
  theme: string;
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
