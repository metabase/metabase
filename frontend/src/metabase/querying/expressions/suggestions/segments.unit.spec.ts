import { createMockMetadata } from "__support__/metadata";
import { SAMPLE_DATABASE, createQuery } from "metabase-lib/test-helpers";
import { createMockSegment, createMockTable } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { complete } from "./__support__";
import { suggestSegments } from "./segments";

describe("suggestSegments", () => {
  function setup() {
    const DATABASE_ID = SAMPLE_DATABASE.id;
    const TABLE_ID = 1;

    const SEGMENT_FOO = createMockSegment({
      id: 1,
      name: "Foo",
      table_id: TABLE_ID,
    });

    const SEGMENT_BAR = createMockSegment({
      id: 2,
      name: "Bar",
      table_id: TABLE_ID,
    });

    const TABLE = createMockTable({
      db_id: DATABASE_ID,
      id: TABLE_ID,
      segments: [SEGMENT_FOO, SEGMENT_BAR],
    });

    const DATABASE = createSampleDatabase({
      id: DATABASE_ID,
      name: "Database",
      tables: [TABLE],
    });

    const metadata = createMockMetadata({
      databases: [DATABASE],
      tables: [TABLE],
      segments: [SEGMENT_FOO, SEGMENT_BAR],
    });

    const query = createQuery({
      metadata,
      query: {
        database: DATABASE.id,
        type: "query",
        query: {
          "source-table": TABLE.id,
        },
      },
    });

    const source = suggestSegments({
      query,
      stageIndex: -1,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  const RESULTS = {
    from: 0,
    to: 2,
    options: [
      {
        label: "[Foo]",
        displayLabel: "Foo",
        type: "segment",
        icon: "segment",
        matches: [[0, 2]],
      },
    ],
  };

  const ALL_RESULTS = {
    from: 0,
    to: 1,
    filter: false,
    options: [
      {
        label: "[Foo]",
        displayLabel: "Foo",
        type: "segment",
        icon: "segment",
      },
      {
        label: "[Bar]",
        displayLabel: "Bar",
        type: "segment",
        icon: "segment",
      },
    ],
  };

  it("should suggest segments", () => {
    const complete = setup();
    const results = complete("Foo|");
    expect(results).toEqual({ ...RESULTS, to: 3 });
  });

  it("should suggest segments, inside word", () => {
    const complete = setup();
    const results = complete("F|o");
    expect(results).toEqual({
      from: 0,
      to: 2,
      options: [
        {
          label: "[Foo]",
          displayLabel: "Foo",
          type: "segment",
          icon: "segment",
          matches: [[0, 1]],
        },
      ],
    });
  });

  it("should suggest segments when typing [", () => {
    const complete = setup();
    const results = complete("[|");
    expect(results).toEqual(ALL_RESULTS);
  });

  it("should suggest segments when inside []", () => {
    const complete = setup();
    const results = complete("[|]");
    expect(results).toEqual({ ...ALL_RESULTS, to: 2 });
  });

  it("should suggest segments in an open [", () => {
    const complete = setup();
    const results = complete("[Fo|");
    expect(results).toEqual({ ...RESULTS, to: 3 });
  });

  it("should suggest segments in an open [, inside a word", () => {
    const complete = setup();
    const results = complete("[F|o");
    expect(results).toEqual({ ...RESULTS, to: 3 });
  });

  it("should suggest segments inside []", () => {
    const complete = setup();
    const results = complete("[Fo|]");
    expect(results).toEqual({ ...RESULTS, to: 4 });
  });

  it("should suggest segments in [], inside a word", () => {
    const complete = setup();
    const results = complete("[F|o]");
    expect(results).toEqual({ ...RESULTS, to: 4 });
  });
});
