import * as Yup from "yup";

import type {
  Transform,
  TransformSource,
  TransformTarget,
  UpdateTransformRequest,
} from "metabase-types/api";

export type IncrementalSettingsFormValues = {
  incremental: boolean;
  sourceStrategy: "checkpoint";
  checkpointFilter: string | null;
  checkpointFilterUniqueKey: string | null;
  checkpointFilterFieldId: string | null; // String because Mantine Select requires string values
  targetStrategy: "append";
};

export const VALIDATION_SCHEMA = Yup.object({
  incremental: Yup.boolean().required(),
  sourceStrategy: Yup.mixed<"checkpoint">().oneOf(["checkpoint"]).required(),
  // For native queries, use checkpointFilter (plain string)
  checkpointFilter: Yup.string().nullable().defined(),
  // For MBQL/Python queries (legacy), use checkpointFilterUniqueKey (prefixed format)
  checkpointFilterUniqueKey: Yup.string().nullable().defined(),
  // For MBQL/Python queries (new), use checkpointFilterFieldId (string because Mantine Select requires strings)
  checkpointFilterFieldId: Yup.string().nullable().defined(),
  targetStrategy: Yup.mixed<"append">().oneOf(["append"]).required(),
});

export const getInitialValues = (
  defaults?: Partial<IncrementalSettingsFormValues>,
): IncrementalSettingsFormValues => ({
  incremental: false,
  sourceStrategy: "checkpoint",
  checkpointFilter: null,
  checkpointFilterUniqueKey: null,
  checkpointFilterFieldId: null,
  targetStrategy: "append",
  ...defaults,
});

export const getIncrementalSettingsFromTransform = (
  transform: Transform,
): IncrementalSettingsFormValues => {
  const isIncremental = transform.target.type === "table-incremental";
  const strategy = transform.source["source-incremental-strategy"];

  // Read all fields from the strategy, whichever is present
  const checkpointFilter =
    strategy?.type === "checkpoint"
      ? (strategy["checkpoint-filter"] ?? null)
      : null;

  const checkpointFilterUniqueKey =
    strategy?.type === "checkpoint"
      ? (strategy["checkpoint-filter-unique-key"] ?? null)
      : null;

  const checkpointFilterFieldId =
    strategy?.type === "checkpoint"
      ? (strategy["checkpoint-filter-field-id"] ?? null)
      : null;

  return {
    incremental: isIncremental,
    sourceStrategy: "checkpoint",
    checkpointFilter: isIncremental ? checkpointFilter : null,
    checkpointFilterUniqueKey: isIncremental ? checkpointFilterUniqueKey : null,
    // Convert number to string for Mantine Select
    checkpointFilterFieldId:
      isIncremental && checkpointFilterFieldId != null
        ? String(checkpointFilterFieldId)
        : null,
    targetStrategy: "append",
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

  // Build strategy fields based on which checkpoint field is present
  // Priority: checkpoint-filter (native) > checkpoint-filter-field-id (MBQL/Python) > checkpoint-filter-unique-key (legacy)
  const strategyFields = formValues.checkpointFilter
    ? { "checkpoint-filter": formValues.checkpointFilter }
    : formValues.checkpointFilterFieldId != null
      ? {
          // Convert string back to number for API
          "checkpoint-filter-field-id": Number(
            formValues.checkpointFilterFieldId,
          ),
        }
      : formValues.checkpointFilterUniqueKey
        ? {
            "checkpoint-filter-unique-key":
              formValues.checkpointFilterUniqueKey,
          }
        : {};

  return {
    ...source,
    "source-incremental-strategy": {
      type: formValues.sourceStrategy,
      ...strategyFields,
    },
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
  return {
    ...base,
    type: "table-incremental",
    "target-incremental-strategy": {
      type: values.targetStrategy,
    },
  };
};
