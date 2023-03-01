import Metadata from "metabase-lib/metadata/Metadata";
import { createMockDatabase } from "./database";
import { createMockTable } from "./table";

export function createMockMetadata(options: Partial<Metadata> = {}) {
  return new Metadata({
    databases: { 1: createMockDatabase() },
    tables: { 1: createMockTable() },
    questions: {},
    schemas: {},
    fields: {},
    metrics: {},
    segments: {},
    ...options,
  });
}
