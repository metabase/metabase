import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_DATABASE } from "metabase-lib/test-helpers";
import {
  createMockSegment,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { PEOPLE, PEOPLE_ID } from "metabase-types/api/mocks/presets";

import type { UsersTableLink } from "../columns";
import { createFlagAllocator } from "../events/allocate-flags";
import { findColumn } from "../find-column";

import { buildPeopleSegmentsQuery } from "./people-segments";
import type { PeopleSegmentRef } from "./types";

const STAGE = -1;
const SEGMENT_ID = 7;

const PROVIDER = Lib.metadataProvider(
  SAMPLE_DATABASE.id,
  createMockMetadata({
    databases: [SAMPLE_DATABASE],
    segments: [
      createMockSegment({
        id: SEGMENT_ID,
        name: "Californians",
        table_id: PEOPLE_ID,
        definition: createMockStructuredDatasetQuery({
          query: {
            "source-table": PEOPLE_ID,
            filter: ["=", ["field", PEOPLE.STATE, null], "CA"],
          },
        }),
      }),
    ],
  }),
);

const USERS_TABLE: UsersTableLink = {
  tableId: PEOPLE_ID,
  foreignKey: "USER_ID",
  primaryKey: "ID",
};

const SAVED: PeopleSegmentRef = {
  key: `segment-${SEGMENT_ID}`,
  label: "Californians",
  definition: { type: "saved", segmentId: SEGMENT_ID },
};

const getDraftQuery = () => {
  const query = Lib.queryFromTableOrCardMetadata(
    PROVIDER,
    checkNotNull(Lib.tableOrCardMetadata(PROVIDER, PEOPLE_ID)),
  );
  const twitter = Lib.stringFilterClause({
    operator: "=",
    column: findColumn(query, "SOURCE"),
    values: ["Twitter"],
    options: {},
  });
  const california = Lib.stringFilterClause({
    operator: "=",
    column: findColumn(query, "STATE"),
    values: ["CA"],
    options: {},
  });
  return Lib.toJsQuery(
    Lib.filter(Lib.filter(query, STAGE, twitter), STAGE, california),
  );
};

const DRAFT: PeopleSegmentRef = {
  key: "draft-1",
  label: "Californians from Twitter",
  definition: { type: "draft", query: getDraftQuery() },
};

const build = (...segments: PeopleSegmentRef[]) => {
  const flags = createFlagAllocator();
  segments.forEach(flags.segmentFlagFor);
  return buildPeopleSegmentsQuery(PROVIDER, USERS_TABLE, flags.segments);
};

const getExpressionParts = (query: Lib.Query) =>
  Lib.expressions(query, STAGE).map((expression) => ({
    name: Lib.displayInfo(query, STAGE, expression).displayName,
    parts: Lib.expressionParts(query, STAGE, expression),
  }));

describe("buildPeopleSegmentsQuery", () => {
  it("selects the users table key and a 0/1 column per segment", () => {
    const query = build(SAVED, DRAFT);

    expect(
      Lib.returnedColumns(query, STAGE).map(
        (column) => Lib.displayInfo(query, STAGE, column).name,
      ),
    ).toEqual(["ID", "seg_1", "seg_2"]);
  });

  it("keeps a saved segment as a segment clause", () => {
    const query = build(SAVED);
    const [{ name, parts }] = getExpressionParts(query);

    expect(name).toBe("seg_1");
    expect(parts).toMatchObject({ operator: "case", args: [{}, 1, 0] });
    expect(JSON.stringify(Lib.toJsQuery(query))).toMatch(
      new RegExp(`\\["segment",\\{[^}]*\\},${SEGMENT_ID}\\]`),
    );
  });

  it("ANDs a draft's conditions", () => {
    const [{ parts }] = getExpressionParts(build(DRAFT));

    expect(parts).toMatchObject({
      operator: "case",
      args: [
        { operator: "and", args: [{ operator: "=" }, { operator: "=" }] },
        1,
        0,
      ],
    });
  });

  it("names a saved segment the metadata doesn't know", () => {
    expect(() =>
      build({
        ...SAVED,
        label: "Deleted",
        definition: { type: "saved", segmentId: 999 },
      }),
    ).toThrow("The segment “Deleted” can't be found.");
  });
});

describe("segmentFlagFor", () => {
  it("gives segments with the same definition one flag", () => {
    const flags = createFlagAllocator();

    expect(flags.segmentFlagFor(SAVED)).toBe("seg_1");
    expect(flags.segmentFlagFor({ ...SAVED, label: "Renamed" })).toBe("seg_1");
    expect(flags.segmentFlagFor(DRAFT)).toBe("seg_2");
    expect(flags.segments.map(({ flag }) => flag)).toEqual(["seg_1", "seg_2"]);
  });
});
