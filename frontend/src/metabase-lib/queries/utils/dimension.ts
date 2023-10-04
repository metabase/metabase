import type {
  ConcreteFieldReference,
  VariableTarget,
} from "metabase-types/api";
import type Metadata from "metabase-lib/metadata/Metadata";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type NativeQuery from "metabase-lib/queries/NativeQuery";

import Dimension from "metabase-lib/Dimension";

function getDimension(
  fieldRef: ConcreteFieldReference | VariableTarget,
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
  const fieldRef = filterClause[1] as ConcreteFieldReference;
  return getDimension(fieldRef, metadata, query);
}
