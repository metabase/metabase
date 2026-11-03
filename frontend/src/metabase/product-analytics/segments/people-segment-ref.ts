import { isRecord } from "metabase-types/guards";

import type { PaletteSegment, PeopleSegmentRef } from "./types";

/** How an analysis keeps a palette segment. */
export const toPeopleSegmentRef = (
  segment: PaletteSegment,
): PeopleSegmentRef => {
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
