import { Filter, NormalizedSegment } from "metabase-types/api";
import type Metadata from "./Metadata";
import type Table from "./Table";

export default class Segment {
  private readonly segment: NormalizedSegment;
  table?: Table;
  metadata?: Metadata;

  constructor(segment: NormalizedSegment) {
    this.segment = segment;
  }

  get id() {
    return this.segment.id;
  }

  get name() {
    return this.segment.name;
  }

  get description() {
    return this.segment.description;
  }

  get table_id() {
    return this.segment.table_id;
  }

  get definition() {
    return this.segment.definition;
  }

  get revision_message() {
    return this.segment.revision_message;
  }

  get archived() {
    return this.segment.archived;
  }

  getPlainObject() {
    return this.segment;
  }

  displayName() {
    return this.name;
  }

  filterClause(): Filter {
    return ["segment", this.id];
  }

  isActive() {
    return !this.archived;
  }
}
