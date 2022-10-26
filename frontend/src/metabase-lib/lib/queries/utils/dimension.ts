import type { ConcreteField, FilterClause } from "metabase-types/types/Query";
import type { VariableTarget } from "metabase-types/types/Parameter";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type NativeQuery from "metabase-lib/lib/queries/NativeQuery";

import Dimension from "metabase-lib/lib/Dimension";

export function getDimension(
  fieldRef: ConcreteField | VariableTarget,
  metadata: Metadata,
  query?: StructuredQuery | NativeQuery | null | undefined,
) {
  metadata = metadata || query?.metadata();
  if (!metadata) {
    console.warn("Metadata is required to create a Dimension");
  }

  const dimension = Dimension.parseMBQL(fieldRef, metadata, query);

  if (!dimension) {
    console.warn("Unknown MBQL Field clause", fieldRef);
  }

  return dimension;
}

export function getFilterDimension(
  filterClause: any[],
  metadata: Metadata,
  query?: StructuredQuery | NativeQuery | null | undefined,
) {
  const fieldRef = filterClause[1] as ConcreteField;
  return getDimension(fieldRef, metadata, query);
}
