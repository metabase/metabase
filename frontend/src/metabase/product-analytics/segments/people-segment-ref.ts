import { isRecord } from "metabase-types/guards";

import type { PaletteSegment, PeopleSegmentRef } from "./types";

/** How an analysis keeps a palette segment; undefined for a sample, which has no conditions. */
export const toPeopleSegmentRef = (
  segment: PaletteSegment,
): PeopleSegmentRef | undefined => {
  switch (segment.status) {
    case "saved":
      return {
        key: segment.key,
        label: segment.name,
        definition: { type: "saved", segmentId: segment.segment.id },
      };
    case "draft":
      return {
        key: segment.key,
        label: segment.name,
        definition: { type: "draft", query: segment.query },
      };
    case "sample":
      return undefined;
  }
};

const isPeopleSegmentDefinition = (
  value: unknown,
): value is PeopleSegmentRef["definition"] =>
  isRecord(value) &&
  ((value.type === "saved" && typeof value.segmentId === "number") ||
    (value.type === "draft" && isRecord(value.query)));

export const isPeopleSegmentRef = (value: unknown): value is PeopleSegmentRef =>
  isRecord(value) &&
  typeof value.key === "string" &&
  typeof value.label === "string" &&
  isPeopleSegmentDefinition(value.definition);
