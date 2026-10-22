import type {
  OpaqueDatasetQuery,
  Segment,
  SegmentId,
} from "metabase-types/api";

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

/**
 * A people segment as an analysis keeps it. A saved segment is kept by id, so
 * later edits to it carry through; a draft keeps its own conditions, so it
 * works wherever the analysis is opened.
 */
export type PeopleSegmentRef = {
  /** The palette item it came from, so it can't be picked twice. */
  key: string;
  label: string;
  definition:
    | { type: "saved"; segmentId: SegmentId }
    | { type: "draft"; query: OpaqueDatasetQuery };
};

/** A people segment in use, with its 0/1 membership column on `events_base`. */
export type AllocatedPeopleSegment = {
  flag: string;
  segment: PeopleSegmentRef;
};
