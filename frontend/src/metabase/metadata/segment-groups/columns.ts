import type { FieldId, Segment } from "metabase-types/api";

import type { SegmentGroup } from "./segment-groups";

/**
 * The columns a segment's filter reads, from its definition in either query
 * format: `["field", id, opts]` (legacy) or `["field", opts, id]` (MBQL 5).
 */
export function getSegmentFieldIds(segment: Pick<Segment, "definition">) {
  const fieldIds = new Set<FieldId>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      if (value[0] === "field") {
        const id = typeof value[1] === "number" ? value[1] : value[2];
        if (typeof id === "number") {
          fieldIds.add(id);
        }
      }
      value.forEach(visit);
    } else if (value != null && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(segment.definition);
  return fieldIds;
}

/**
 * A partition on one column: sync made it from that column, or each of its
 * segments filters on that column alone. A grouping on the column can use it.
 */
export function isPartitionOnField(
  group: SegmentGroup,
  fieldId: FieldId,
  segments: Segment[],
): boolean {
  if (group.kind !== "partition") {
    return false;
  }
  if (group.sourceFieldId === fieldId) {
    return true;
  }
  return (
    group.members.length > 0 &&
    group.members.every(({ segmentId }) => {
      const segment = segments.find(({ id }) => id === segmentId);
      if (!segment) {
        return false;
      }
      const fieldIds = getSegmentFieldIds(segment);
      return fieldIds.size === 1 && fieldIds.has(fieldId);
    })
  );
}
