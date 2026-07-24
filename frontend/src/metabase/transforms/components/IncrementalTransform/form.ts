import * as Yup from "yup";

import * as Errors from "metabase/utils/errors";
import type {
  Transform,
  TransformSource,
  TransformTarget,
  UpdateTransformRequest,
} from "metabase-types/api";

export type IncrementalSettingsFormValues = {
  incremental: boolean;
  sourceStrategy: "checkpoint";
  checkpointFilterFieldId: string | null; // String because Mantine Select requires string values
  // Comma-separated target column names. Empty → append. Non-empty → the target is upserted
  // (merge/restate) on these columns instead of appended.
  uniqueKey: string;
};

export const VALIDATION_SCHEMA = Yup.object({
  incremental: Yup.boolean().required(),
  sourceStrategy: Yup.mixed<"checkpoint">().oneOf(["checkpoint"]).required(),
  // `$hasCodeManagedSyncCursor` is threaded in via `FormProvider`'s `validationContext`;
  // python transforms without source tables manage the cursor in code, so no
  // checkpoint field is required.
  checkpointFilterFieldId: Yup.string()
    .nullable()
    .defined()
    .when(["incremental", "sourceStrategy", "$hasCodeManagedSyncCursor"], {
      is: (
        incremental: boolean,
        sourceStrategy: "checkpoint",
        hasCodeManagedSyncCursor: boolean | undefined,
      ) =>
        incremental &&
        sourceStrategy === "checkpoint" &&
        !hasCodeManagedSyncCursor,
      then: (schema) => schema.required(Errors.required),
      otherwise: (schema) => schema.nullable().defined(),
    }),
  uniqueKey: Yup.string().default(""),
});

export const getInitialValues = (
  defaults?: Partial<IncrementalSettingsFormValues>,
): IncrementalSettingsFormValues => ({
  incremental: false,
  sourceStrategy: "checkpoint",
  checkpointFilterFieldId: null,
  uniqueKey: "",
  ...defaults,
});

const parseUniqueKey = (uniqueKey: string) =>
  uniqueKey
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => ({ name }));

export const getIncrementalSettingsFromTransform = (
  transform: Transform,
): IncrementalSettingsFormValues => {
  const isIncremental = transform.target.type === "table-incremental";
  const strategy = transform.source["source-incremental-strategy"];

  const checkpointFilterFieldId =
    strategy?.type === "checkpoint"
      ? (strategy["checkpoint-filter-field-id"] ?? null)
      : null;

  const targetStrategy =
    transform.target.type === "table-incremental"
      ? transform.target["target-incremental-strategy"]
      : undefined;

  return {
    incremental: isIncremental,
    sourceStrategy: "checkpoint",
    checkpointFilterFieldId:
      isIncremental && checkpointFilterFieldId != null
        ? String(checkpointFilterFieldId)
        : null,
    uniqueKey:
      targetStrategy?.type === "merge"
        ? targetStrategy["unique-key"]
            .map((column) => column.name)
            .filter((name): name is string => name != null)
            .join(", ")
        : "",
  };
};

export const convertTransformFormToUpdateRequest = (
  transform: Transform,
  values: IncrementalSettingsFormValues,
): UpdateTransformRequest => {
  const source = buildIncrementalSource(transform.source, values);
  const target = buildIncrementalTarget(transform.target, values);

  return {
    id: transform.id,
    source,
    target,
  };
};

export const buildIncrementalSource = (
  source: TransformSource,
  formValues: IncrementalSettingsFormValues,
): TransformSource => {
  if (!formValues.incremental) {
    return {
      ...source,
      "source-incremental-strategy": undefined,
    };
  }

  return {
    ...source,
    "source-incremental-strategy":
      formValues.checkpointFilterFieldId != null
        ? {
            type: formValues.sourceStrategy,
            "checkpoint-filter-field-id": Number(
              formValues.checkpointFilterFieldId,
            ),
          }
        : undefined,
  };
};

export const buildIncrementalTarget = (
  target: Omit<TransformTarget, "type">,
  values: IncrementalSettingsFormValues,
): TransformTarget => {
  const base: TransformTarget = {
    type: "table",
    schema: target.schema ?? null,
    name: target.name,
    database: target.database,
  };
  if (!values.incremental) {
    return base;
  }
  const uniqueKey = parseUniqueKey(values.uniqueKey);
  return {
    ...base,
    type: "table-incremental",
    "target-incremental-strategy":
      uniqueKey.length > 0
        ? { type: "merge", "unique-key": uniqueKey }
        : { type: "append" },
  };
};
