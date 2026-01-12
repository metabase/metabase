import * as Lib from "metabase-lib";

import {
  DEFAULT_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  createQuery,
} from "./test-helpers";

describe("fromJsQuery", () => {
  // this is a very important optimization that the FE heavily relies upon
  it("should return the same object for the same database id, query, and metadata", () => {
    const metadataProvider = Lib.metadataProvider(
      SAMPLE_DATABASE.id,
      SAMPLE_METADATA,
    );
    const query1 = Lib.fromJsQuery(metadataProvider, DEFAULT_QUERY);
    const query2 = Lib.fromJsQuery(metadataProvider, DEFAULT_QUERY);
    expect(query1 === query2).toBe(true);
  });
});

describe("toLegacyQuery", () => {
  it("should serialize a query", () => {
    const query = createQuery();
    expect(Lib.toLegacyQuery(query)).toEqual(DEFAULT_QUERY);
  });
});

describe("suggestedName", () => {
  it("should suggest a query name", () => {
    const query = createQuery();
    expect(Lib.suggestedName(query)).toBe("Orders");
  });
});

describe("stageIndexes", () => {
  it("should return stage indexes for a single-stage query", () => {
    const query = createQuery();
    expect(Lib.stageIndexes(query)).toEqual([0]);
  });

  it("should return stage indexes for a multi-stage query", () => {
    const query = Lib.appendStage(Lib.appendStage(createQuery()));
    expect(Lib.stageIndexes(query)).toEqual([0, 1, 2]);
  });
});
