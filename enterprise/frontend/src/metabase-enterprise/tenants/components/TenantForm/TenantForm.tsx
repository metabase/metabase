import { t } from "ttag";
import * as Yup from "yup";

import { FormFooter } from "metabase/core/components/FormFooter";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button } from "metabase/ui";
import type { Tenant } from "metabase-types/api";

const MAX_SLUG_LENGTH = 255;

const localTenantSchema = Yup.object({
  name: Yup.string().default("").required().max(254, Errors.maxLength),
  slug: Yup.string()
    .default("")
    .required()
    .matches(/^[-_a-z0-9]+$/, {
      excludeEmptyString: true,
      get message() {
        return t`Only lowercase letters, numbers, hyphens (-), and underscores (_) are allowed`;
      },
    })
    .max(MAX_SLUG_LENGTH, Errors.maxLength),
});

interface TenantFormProps {
  initialValues?: Partial<Tenant>;
  onSubmit: (val: Partial<Tenant>) => void;
  onCancel: () => void;
  submitText?: string;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_") // replace spaces with underscores
    .replace(/[^-_a-z0-9]/g, "") // remove any invalid chars
    .slice(0, MAX_SLUG_LENGTH); // limit to max allowed length
}

export const TenantForm = ({
  initialValues = {},
  onSubmit,
  onCancel,
  submitText = t`Update`,
}: TenantFormProps) => {
  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={localTenantSchema}
      enableReinitialize
      onSubmit={onSubmit}
    >
      {({ values, setFieldValue, dirty }) => (
        <Form disabled={!dirty} mt="sm">
          <FormTextInput
            name="name"
            title={t`Display name`}
            label={t`Display name`}
            description={t`How to refer to this tenant`}
            mb="md"
            onChange={(e) => {
              const value = e.target.value;
              setFieldValue("name", value);

              const isSlugModified =
                slugify(values.name ?? "") !== (values.slug ?? "");
              const shouldAutoSetSlug = !initialValues.slug && !isSlugModified;
              if (shouldAutoSetSlug) {
                setFieldValue("slug", slugify(value));
              }
            }}
          />
          <FormTextInput
            name="slug"
            title={t`Slug`}
            label={t`Slug`}
            description={t`A unique name for the tenant. Should match the field in the JWT `}
            disabled={!!initialValues.slug}
            mb="xl"
          />
          <FormFooter>
            <FormErrorMessage inline />
            <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={submitText}
              disabled={!dirty}
              variant="filled"
            />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
};
