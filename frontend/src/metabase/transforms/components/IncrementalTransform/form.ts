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
  targetStrategy: "append";
};

export const VALIDATION_SCHEMA = Yup.object({
  incremental: Yup.boolean().required(),
  sourceStrategy: Yup.mixed<"checkpoint">().oneOf(["checkpoint"]).required(),
  checkpointFilterFieldId: Yup.string()
    .nullable()
    .defined()
    .when(["incremental", "sourceStrategy"], {
      is: (incremental: boolean, sourceStrategy: "checkpoint") =>
        incremental && sourceStrategy === "checkpoint",
      then: (schema) => schema.required(Errors.required),
      otherwise: (schema) => schema.nullable().defined(),
    }),
  targetStrategy: Yup.mixed<"append">().oneOf(["append"]).required(),
});

export const getInitialValues = (
  defaults?: Partial<IncrementalSettingsFormValues>,
): IncrementalSettingsFormValues => ({
  incremental: false,
  sourceStrategy: "checkpoint",
  checkpointFilterFieldId: null,
  targetStrategy: "append",
  ...defaults,
});

export const getIncrementalSettingsFromTransform = (
  transform: Transform,
): IncrementalSettingsFormValues => {
  const isIncremental = transform.target.type === "table-incremental";
  const strategy = transform.source["source-incremental-strategy"];

  const checkpointFilterFieldId =
    strategy?.type === "checkpoint"
      ? (strategy["checkpoint-filter-field-id"] ?? null)
      : null;

  return {
    incremental: isIncremental,
    sourceStrategy: "checkpoint",
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
  return {
    ...base,
    type: "table-incremental",
    "target-incremental-strategy": {
      type: values.targetStrategy,
    },
  };
};
