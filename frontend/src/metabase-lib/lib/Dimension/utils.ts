// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import _ from "underscore";
import Metadata from "../metadata/Metadata";
import { ConcreteField } from "metabase-types/types/Query";
import StructuredQuery from "../queries/StructuredQuery";
import Dimension from "./Dimension";
import AggregationDimension from "./AggregationDimension";
import FieldDimension from "./FieldDimension";
import ExpressionDimension from "./ExpressionDimension";
import TemplateTagDimension from "./TemplateTagDimension";

const DIMENSION_TYPES = [
  FieldDimension,
  ExpressionDimension,
  AggregationDimension,
  TemplateTagDimension,
] as const;

Dimension.parseMBQL = parseDimensionFromMBQL;
Dimension.prototype.defaultDimension = getDefaultDimension;

/**
 * Parses an MBQL expression into an appropriate Dimension subclass, if possible.
 * Metadata should be provided if you intend to use the display name or render methods.
 */
export function parseDimensionFromMBQL(
  mbql: ConcreteField,
  metadata?: Metadata,
  query?: StructuredQuery | null | undefined,
): Dimension | null | undefined {
  for (const D of DIMENSION_TYPES) {
    const dimension = D.parseMBQL(mbql, metadata, query);

    if (dimension != null) {
      return Object.freeze(dimension);
    }
  }

  return null;
}

/**
 * Returns the default sub-dimension of this dimension, if any.
 * @abstract
 */
export function getDefaultDimension(
  DimensionTypes: any[] = DIMENSION_TYPES,
): Dimension | null | undefined {
  const defaultDimensionOption = this.field().default_dimension_option;
  if (defaultDimensionOption) {
    const dimension = this._dimensionForOption(defaultDimensionOption);

    // NOTE: temporarily disable for DatetimeFieldDimension until backend automatically picks appropriate bucketing
    if (!(dimension?.isFieldDimension() && dimension.temporalUnit())) {
      return dimension;
    }
  }

  for (const DimensionType of DimensionTypes) {
    const defaultDimension = DimensionType.defaultDimension(this);
    if (defaultDimension) {
      return defaultDimension;
    }
  }

  return null;
}
