import { sql } from "@codemirror/lang-sql";
import type { FormikHelpers } from "formik";
import { useCallback, useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import {
  useCreateSnippetMutation,
  useUpdateSnippetMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { EditableDescription } from "metabase/common/components/EditableDescription";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useToast } from "metabase/common/hooks";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/data-studio/components/PaneHeader";
import { FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_COLLECTION_PICKER_MODAL } from "metabase/plugins";
import { Box, Stack } from "metabase/ui";
import type {
  NativeQuerySnippet,
  RegularCollectionId,
} from "metabase-types/api";

import S from "./SnippetEditorPageBody.module.css";

const SNIPPET_NAME_MAX_LENGTH = 254;

const SNIPPET_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required).max(SNIPPET_NAME_MAX_LENGTH),
  description: Yup.string().default(""),
  content: Yup.string().default(""),
  collection_id: Yup.mixed<RegularCollectionId | null>()
    .nullable()
    .default(null),
});

type SnippetFormValues = {
  name: string;
  description: string;
  content: string;
  collection_id: RegularCollectionId | null;
};

type SnippetEditorPageBodyProps = {
  initialSnippet?: NativeQuerySnippet;
  isNewSnippet: boolean;
  route: Route;
};

export function SnippetEditorPageBody({
  initialSnippet,
  isNewSnippet,
  route,
}: SnippetEditorPageBodyProps) {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const defaultName = t`New SQL snippet`;
  const [pendingSaveValues, setPendingSaveValues] =
    useState<SnippetFormValues | null>(null);

  const [createSnippet, { isLoading: isCreating }] = useCreateSnippetMutation();
  const [updateSnippet, { isLoading: isUpdating }] = useUpdateSnippetMutation();

  const initialValues: SnippetFormValues = useMemo(
    () => ({
      name: initialSnippet?.name ?? defaultName,
      description: initialSnippet?.description ?? "",
      content: initialSnippet?.content ?? "",
      collection_id: initialSnippet?.collection_id ?? null,
    }),
    [initialSnippet, defaultName],
  );

  const handleSubmit = useCallback(
    async (
      values: SnippetFormValues,
      { resetForm }: FormikHelpers<SnippetFormValues>,
    ) => {
      if (PLUGIN_SNIPPET_COLLECTION_PICKER_MODAL.Component && isNewSnippet) {
        setPendingSaveValues(values);
        return;
      }

      try {
        if (isNewSnippet) {
          const result = await createSnippet(values).unwrap();
          resetForm();
          dispatch(push(Urls.dataStudioSnippet(result.id)));
        } else if (initialSnippet) {
          await updateSnippet({
            id: initialSnippet.id,
            ...values,
          }).unwrap();
          resetForm();
        }
      } catch (error) {
        sendToast({
          message: getErrorMessage(error, t`Failed to save snippet`),
          icon: "warning",
        });
      }
    },
    [
      isNewSnippet,
      createSnippet,
      updateSnippet,
      initialSnippet,
      dispatch,
      sendToast,
    ],
  );

  const handleCollectionSelected = useCallback(
    async (collectionId: RegularCollectionId | null) => {
      if (!pendingSaveValues) {
        return;
      }

      try {
        const result = await createSnippet({
          ...pendingSaveValues,
          collection_id: collectionId,
        }).unwrap();
        setPendingSaveValues(null);
        dispatch(push(Urls.dataStudioSnippet(result.id)));
      } catch (error) {
        sendToast({
          message: getErrorMessage(error, t`Failed to save snippet`),
          icon: "warning",
        });
      }
    },
    [pendingSaveValues, createSnippet, dispatch, sendToast],
  );

  const handleCancel = useCallback(() => {
    dispatch(push(Urls.dataStudioModeling()));
  }, [dispatch]);

  const extensions = useMemo(() => [sql()], []);

  const isSaving = isCreating || isUpdating;

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={SNIPPET_SCHEMA}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      {({ values, setFieldValue, dirty, isValid, submitForm }) => (
        <>
          <Stack pos="relative" w="100%" h="100%" bg="bg-white" gap={0}>
            <PaneHeader
              title={
                <PaneHeaderInput
                  initialValue={values.name}
                  maxLength={SNIPPET_NAME_MAX_LENGTH}
                  onChange={(value) => setFieldValue("name", value)}
                />
              }
              description={
                <EditableDescription
                  description={values.description}
                  canWrite
                  onChange={(value) => setFieldValue("description", value)}
                />
              }
              actions={
                <PaneHeaderActions
                  isValid={isValid}
                  isDirty={dirty}
                  isSaving={isSaving}
                  onSave={submitForm}
                  onCancel={handleCancel}
                />
              }
            />
            <Box flex={1} w="100%" className={S.editorContainer}>
              <CodeMirror
                value={values.content}
                onChange={(value) => setFieldValue("content", value)}
                extensions={extensions}
                height="100%"
                className={S.editor}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLineGutter: true,
                  highlightActiveLine: true,
                }}
              />
            </Box>
          </Stack>
          <LeaveRouteConfirmModal
            route={route}
            isEnabled={dirty && !isSaving}
          />
          {PLUGIN_SNIPPET_COLLECTION_PICKER_MODAL.Component && (
            <PLUGIN_SNIPPET_COLLECTION_PICKER_MODAL.Component
              isOpen={pendingSaveValues !== null}
              onSelect={handleCollectionSelected}
              onClose={() => setPendingSaveValues(null)}
            />
          )}
        </>
      )}
    </FormProvider>
  );
}
