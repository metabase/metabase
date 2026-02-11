import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { Button } from "metabase/common/components/Button";
import { FormErrorMessage } from "metabase/common/components/FormErrorMessage";
import { FormInput } from "metabase/common/components/FormInput";
import { FormSubmitButton } from "metabase/common/components/FormSubmitButton";
import { FormTextArea } from "metabase/common/components/FormTextArea";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Flex } from "metabase/ui";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

import S from "./SnippetForm.module.css";

const SNIPPET_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(500, Errors.maxLength).default(null),
  content: Yup.string()
    .required(Errors.required)
    .max(10000, Errors.maxLength)
    .default(""),
  collection_id: Yup.number().nullable().default(null),
});

export type SnippetFormValues = Pick<
  NativeQuerySnippet,
  "name" | "description" | "content" | "collection_id"
>;

export interface SnippetFormOwnProps {
  snippet?: Partial<SnippetFormValues>;
  isEditing: boolean;
  isDirty?: boolean;
  onSubmit: (snippet: SnippetFormValues) => void | Promise<void>;
  onArchive?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface SnippetLoaderProps {
  snippetCollections: Collection[];
}
type SnippetFormProps = SnippetFormOwnProps & SnippetLoaderProps;

function SnippetFormInner({
  snippet,
  snippetCollections,
  isEditing,
  isDirty: isInitiallyDirty = false,
  onSubmit,
  onArchive,
  onCancel,
}: SnippetFormProps) {
  const hasManyCollections = snippetCollections.length > 1;

  const initialValues = useMemo(
    () =>
      SNIPPET_SCHEMA.cast(
        {
          ...snippet,
          content: snippet?.content || "",
        },
        { stripUnknown: true },
      ),
    [snippet],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={SNIPPET_SCHEMA}
      onSubmit={onSubmit}
    >
      {({ dirty }) => (
        <Form disabled={!dirty && !isInitiallyDirty} className={S.SnippetForm}>
          <FormTextArea
            inputClassName={S.FormSnippetTextArea}
            name="content"
            title={t`Enter some SQL here so you can reuse it later`}
            placeholder="AND canceled_at IS null\nAND account_type = 'PAID'"
            rows={4}
          />
          <FormInput
            name="name"
            title={t`Give your snippet a name`}
            placeholder={t`Current Customers`}
          />
          <FormInput
            name="description"
            title={t`Add a description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
          />
          {hasManyCollections && (
            <FormCollectionPicker
              name="collection_id"
              title={t`Folder this should be in`}
              collectionPickerModalProps={{ namespaces: ["snippets"] }}
            />
          )}
          <Flex align="center" justify="space-between">
            <Flex align="center" justify="center" gap="sm">
              {isEditing && (
                <Button
                  type="button"
                  icon="archive"
                  borderless
                  onClick={onArchive}
                >
                  {t`Archive`}
                </Button>
              )}
              <FormErrorMessage inline />
            </Flex>
            <Flex align="center" justify="center" gap="sm">
              {!!onCancel && (
                <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
              )}
              <FormSubmitButton
                title={t`Save`}
                disabled={!dirty && !isInitiallyDirty}
                primary
              />
            </Flex>
          </Flex>
        </Form>
      )}
    </FormProvider>
  );
}

export const SnippetForm = _.compose(SnippetCollections.loadList())(
  SnippetFormInner,
);
