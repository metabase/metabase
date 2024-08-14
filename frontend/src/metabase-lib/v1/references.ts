import _ from "underscore";

import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type {
  AggregateFieldReference,
  DimensionReference,
  DimensionReferenceWithOptions,
  ExpressionReference,
  FieldId,
  FieldReference,
  ReferenceOptions,
  TemplateTagReference,
} from "metabase-types/api";

export const isFieldReference = (mbql: any): mbql is FieldReference => {
  return Array.isArray(mbql) && mbql.length === 3 && mbql[0] === "field";
};

export const isExpressionReference = (
  mbql: any,
): mbql is ExpressionReference => {
  return Array.isArray(mbql) && mbql.length >= 2 && mbql[0] === "expression";
};

export const isAggregationReference = (
  mbql: any,
): mbql is AggregateFieldReference => {
  return Array.isArray(mbql) && mbql[0] === "aggregation";
};

export const isTemplateTagReference = (
  mbql: any,
): mbql is TemplateTagReference => {
  return Array.isArray(mbql) && mbql[0] === "template-tag";
};

export const createFieldReference = (
  columnNameOrFieldId: string | FieldId,
): FieldReference => ["field", columnNameOrFieldId, null] as FieldReference;

export const isValidDimensionReference = (
  mbql: any,
): mbql is DimensionReference => {
  return [
    isFieldReference,
    isExpressionReference,
    isAggregationReference,
    isTemplateTagReference,
  ].some(predicate => predicate(mbql));
};

export const normalizeReferenceOptions = (
  options?: ReferenceOptions | null,
): ReferenceOptions | null => {
  if (!options) {
    return null;
  }

  // recursively normalize maps inside options.
  options = _.mapObject(options, val =>
    typeof val === "object" ? normalizeReferenceOptions(val) : val,
  );
  // remove null/undefined options from map.
  options = _.omit(options, value => value == null);
  return _.isEmpty(options) ? null : options;
};

export const getNormalizedDimensionReference = (
  mbql: DimensionReference,
): DimensionReference => {
  if (
    isFieldReference(mbql) ||
    isExpressionReference(mbql) ||
    isAggregationReference(mbql)
  ) {
    const normalizedReference = [...mbql] as DimensionReference;
    const normalizedOptions = normalizeReferenceOptions(mbql[2]);
    normalizedReference[2] = normalizedOptions;

    return normalize(normalizedReference);
  }

  return mbql;
};

const getDimensionReferenceWithoutOptions = (
  mbql: DimensionReferenceWithOptions,
  optionsKeysToOmit: string[],
): DimensionReferenceWithOptions => {
  const newReference = mbql.slice() as DimensionReferenceWithOptions;
  const options = newReference[2];

  if (!options) {
    return newReference;
  }

  newReference[2] =
    options == null ? null : _.omit(options, ...optionsKeysToOmit);

  if (_.isEmpty(newReference[2])) {
    newReference[2] = null;
  }

  return newReference;
};

export const BASE_DIMENSION_REFERENCE_OMIT_OPTIONS = [
  "temporal-unit",
  "binning",
];

export const getBaseDimensionReference = (
  mbql: DimensionReferenceWithOptions,
) =>
  getDimensionReferenceWithoutOptions(
    mbql,
    BASE_DIMENSION_REFERENCE_OMIT_OPTIONS,
  );

/**
 * Whether this Field clause has a string Field name (as opposed to an integer Field ID). This generally means the
 * Field comes from a native query.
 */
export const hasStringFieldName = (mbql: FieldReference) =>
  typeof mbql[1] === "string";
