import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import {
  useCreateTableIndexMutation,
  usePreviewTableIndexMutation,
  useUpdateTableIndexRequestMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Box,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type {
  Database,
  IndexAccessMethod,
  IndexRequestId,
  Table,
} from "metabase-types/api";

import { ColumnsPicker } from "./ColumnsPicker";
import S from "./IndexForm.module.css";
import { SqlPreview } from "./SqlPreview";
import { ACCESS_METHODS, type FormMode, type IndexFormState } from "./types";
import {
  defaultIndexName,
  emptyFormState,
  formStateFromIndex,
  formStateToStructured,
  isFormValid,
} from "./utils";

interface Props {
  mode: FormMode & ({ kind: "create" } | { kind: "edit"; requestId: IndexRequestId });
  table: Table;
  database: Database | undefined;
  onCancel: () => void;
  onSubmitted: () => void;
}

export function IndexForm({
  mode,
  table,
  database,
  onCancel,
  onSubmitted,
}: Props) {
  const fields = useMemo(() => table.fields ?? [], [table.fields]);
  const supportsConcurrent = Boolean(
    database?.features?.includes("index/create-concurrently"),
  );

  const [state, setState] = useState<IndexFormState>(() =>
    mode.kind === "edit"
      ? formStateFromIndex(mode.existing)
      : { ...emptyFormState(), concurrent: supportsConcurrent },
  );

  const [previewIndex, previewResult] = usePreviewTableIndexMutation();
  const [createIndex, createResult] = useCreateTableIndexMutation();
  const [updateIndex, updateResult] = useUpdateTableIndexRequestMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const [serverPreview, setServerPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Auto-name suggestion when the user hasn't picked a name yet.
  const autoName = useMemo(
    () => defaultIndexName(table, state.columns.map((c) => c.name)),
    [table, state.columns],
  );

  useEffect(() => {
    if (mode.kind === "create" && state.name === "" && state.columns.length > 0) {
      setState((prev) => ({ ...prev, name: autoName }));
    }
  }, [autoName, mode.kind, state.name, state.columns.length]);

  // Debounced preview request while not in raw-edit mode.
  useDebounce(
    () => {
      if (state.rawStatement != null) {
        return;
      }
      if (state.columns.length === 0 || !state.name) {
        setServerPreview(null);
        setPreviewError(null);
        return;
      }
      const structured = formStateToStructured(state);
      previewIndex({ tableId: table.id, structured })
        .unwrap()
        .then((res) => {
          setServerPreview(res.statement);
          setPreviewError(null);
        })
        .catch((err) => {
          const message =
            (err && typeof err === "object" && "data" in err
              ? String((err as { data?: { message?: string } }).data?.message ?? "")
              : "") || t`Couldn't generate preview.`;
          setPreviewError(message);
        });
    },
    250,
    [state, table.id, previewIndex],
  );

  const handleSubmit = async () => {
    const isEdit = mode.kind === "edit";
    const action = isEdit
      ? (body: Record<string, unknown>) =>
          updateIndex({
            tableId: table.id,
            requestId: mode.requestId,
            ...body,
          } as Parameters<typeof updateIndex>[0])
      : (body: Record<string, unknown>) =>
          createIndex({
            tableId: table.id,
            ...body,
          } as Parameters<typeof createIndex>[0]);

    const body =
      state.rawStatement != null
        ? { statement: state.rawStatement }
        : { structured: formStateToStructured(state) };

    const result = await action(body);
    if ("error" in result && result.error) {
      sendErrorToast(
        isEdit ? t`Failed to update index` : t`Failed to create index`,
      );
      return;
    }
    sendSuccessToast(
      isEdit ? t`Index update queued` : t`Index creation queued`,
    );
    onSubmitted();
  };

  const isSubmitting = createResult.isLoading || updateResult.isLoading;
  const submitDisabled = !isFormValid(state) || isSubmitting;
  const previewStatement = state.rawStatement ?? serverPreview;
  const isPreviewLoading = previewResult.isLoading;

  return (
    <Stack gap={0}>
      <Box>
        <Text c="text-secondary" size="sm">
          {mode.kind === "edit" ? t`Editing index on table` : t`On table`}{" "}
          <span className={S.tableLink}>{table.display_name || table.name}</span>
        </Text>
      </Box>

      <Box className={S.divider} />

      <Box className={S.section}>
        <Text className={S.sectionTitle}>{t`1. Columns`}</Text>
        <ColumnsPicker
          fields={fields}
          columns={state.columns}
          onChange={(columns) => setState((prev) => ({ ...prev, columns }))}
        />
      </Box>

      <Box className={S.divider} />

      <Box className={S.section}>
        <Text className={S.sectionTitle}>{t`2. Index options`}</Text>

        <TextInput
          label={t`Index name`}
          placeholder={autoName}
          value={state.name}
          onChange={(event) =>
            setState((prev) => ({ ...prev, name: event.currentTarget.value }))
          }
        />

        <Select
          label={t`Index type`}
          value={state.method}
          allowDeselect={false}
          data={ACCESS_METHODS.map((m) => ({ value: m.value, label: m.label }))}
          onChange={(value) => {
            if (value) {
              setState((prev) => ({
                ...prev,
                method: value as IndexAccessMethod,
              }));
            }
          }}
        />

        <Checkbox
          label={t`Unique index`}
          description={t`Enforce uniqueness for the indexed columns.`}
          checked={state.unique}
          onChange={(event) =>
            setState((prev) => ({
              ...prev,
              unique: event.currentTarget.checked,
            }))
          }
        />

        {supportsConcurrent && (
          <Checkbox
            label={t`Create concurrently`}
            description={t`Build the index without blocking writes to the table.`}
            checked={state.concurrent}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                concurrent: event.currentTarget.checked,
              }))
            }
          />
        )}
      </Box>

      <Box className={S.divider} />

      <Box className={S.section}>
        <Text className={S.sectionTitle}>{t`3. Preview`}</Text>
        <SqlPreview
          statement={previewStatement}
          isEditing={state.rawStatement != null}
          isLoading={isPreviewLoading}
          onEditStart={() =>
            setState((prev) => ({
              ...prev,
              rawStatement: previewStatement ?? "",
            }))
          }
          onChange={(value) =>
            setState((prev) => ({ ...prev, rawStatement: value }))
          }
        />
        {previewError && state.rawStatement == null && (
          <Text c="error" size="xs">
            {previewError}
          </Text>
        )}
      </Box>

      <Group className={S.footer}>
        <Button variant="default" onClick={onCancel}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          loading={isSubmitting}
          disabled={submitDisabled}
          onClick={handleSubmit}
        >
          {mode.kind === "edit" ? t`Update index` : t`Create index`}
        </Button>
      </Group>
    </Stack>
  );
}
