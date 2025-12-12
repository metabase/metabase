import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getColumnGroupIcon } from "./column-groups";

function getQueryWithTableDataSource() {
  const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, SAMPLE_METADATA);
  const tableMetadata = checkNotNull(
    Lib.tableOrCardMetadata(metadataProvider, ORDERS_ID),
  );
  return Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);
}

function getQueryWithCardDataSource() {
  const cardId = 1;
  const card = Question.create({
    dataset_query: Lib.toJsQuery(getQueryWithTableDataSource()),
  })
    .setId(cardId)
    .setDisplayName("Card")
    .card();
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    questions: [card],
  });
  const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, metadata);
  const cardMetadata = checkNotNull(
    Lib.tableOrCardMetadata(metadataProvider, `card__${cardId}`),
  );
  return Lib.queryFromTableOrCardMetadata(metadataProvider, cardMetadata);
}

describe("getColumnGroupIcon", () => {
  it.each([
    {
      query: getQueryWithTableDataSource(),
      stageIndex: 0,
      expectedGroupNames: ["Orders", "Product", "User"],
      expectedGroupIcons: ["table", "connections", "connections"],
    },
    {
      query: getQueryWithCardDataSource(),
      stageIndex: 0,
      expectedGroupNames: ["Card", "Product", "User"],
      expectedGroupIcons: ["table2", "connections", "connections"],
    },
  ])(
    "should use correct icons for columns groups",
    ({ query, stageIndex, expectedGroupNames, expectedGroupIcons }) => {
      const columns = Lib.filterableColumns(query, stageIndex);
      const groups = Lib.groupColumns(columns);
      const groupsInfo = groups.map((group) =>
        Lib.displayInfo(query, stageIndex, group),
      );
      const groupNames = groupsInfo.map((groupInfo) => groupInfo.displayName);
      const groupIcons = groupsInfo.map(getColumnGroupIcon);
      expect(groupNames).toEqual(expectedGroupNames);
      expect(groupIcons).toEqual(expectedGroupIcons);
    },
  );
});
