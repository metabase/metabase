import type { OpaqueDatasetQuery, Segment } from "metabase-types/api";

/** Which table a palette segment filters: the events, or the people who did them. */
export type SegmentSource = "event" | "people";

type PaletteSegmentBase = {
  key: string;
  source: SegmentSource;
  name: string;
  description?: string;
};

/** A segment saved on the table. */
export type SavedPaletteSegment = PaletteSegmentBase & {
  status: "saved";
  segment: Segment;
};

/** A segment drafted in this session: usable right away, not saved. */
export type DraftPaletteSegment = PaletteSegmentBase & {
  status: "draft";
  query: OpaqueDatasetQuery;
};

/** A prototype placeholder, shown while no people table is linked. */
export type SamplePaletteSegment = PaletteSegmentBase & {
  status: "sample";
};

export type PaletteSegment =
  | SavedPaletteSegment
  | DraftPaletteSegment
  | SamplePaletteSegment;

/** A draft's conditions, kept for the session until saved or discarded. */
export type SegmentDraft = {
  id: string;
  name: string;
  query: OpaqueDatasetQuery;
};
