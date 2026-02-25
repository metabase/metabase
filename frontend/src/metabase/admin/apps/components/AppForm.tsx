import { useFormik } from "formik";
import { useCallback, useEffect } from "react";
import { t } from "ttag";

import {
  useCreateAppMutation,
  useGetAppQuery,
  useUpdateAppMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useRouter } from "metabase/router";
import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  TextInput,
  Title,
} from "metabase/ui";

interface AppFormValues {
  name: string;
  auth_method: "jwt" | "saml";
  collection_id: number;
  theme: string;
  published: boolean;
}

const AUTH_METHOD_OPTIONS = [
  { value: "jwt", label: "JWT" },
  { value: "saml", label: "SAML" },
];

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
            data={AUTH_METHOD_OPTIONS}
            value={formik.values.auth_method}
            onChange={(value) =>
              formik.setFieldValue("auth_method", value ?? "jwt")
            }
          />
          <NumberInput
            label={t`Collection ID`}
            required
            min={1}
            value={formik.values.collection_id}
            onChange={(value) =>
              formik.setFieldValue("collection_id", value ?? 0)
            }
          />
          <TextInput label={t`Theme`} {...formik.getFieldProps("theme")} />
          <Switch
            label={t`Published`}
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
