import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";
import type { DatasetColumn } from "metabase-types/api";
import { checkNotNull } from "metabase/lib/types";
import ZoomDrill from "./ZoomDrill";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = checkNotNull(metadata.table(ORDERS_ID));

describe("ZoomDrill", () => {
  it("should not be valid for top level actions", () => {
    expect(ZoomDrill({ question: ordersTable.newQuestion() })).toHaveLength(0);
  });

  describe("title", () => {
    it("should return generic title for drillable non-date field", () => {
      const actions = ZoomDrill(setupCategoryFieldQuery());

      expect(actions).toHaveLength(1);

      const action = actions[0];
      expect(action.title).toBe(`Zoom in`);
    });
  });
});

function setupCategoryFieldQuery() {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const peopleTable = checkNotNull(metadata.table(PEOPLE_ID));
  const peopleStateField = checkNotNull(metadata.field(PEOPLE.STATE));

  const query = peopleTable
    .query()
    .aggregate(["count"])
    .breakout(["field", PEOPLE.STATE, null]);

  const question = query.question();

  const clicked = {
    column: peopleStateField.column(),
    value: 194,
    dimensions: [
      {
        column: peopleStateField.dimension().column() as DatasetColumn,
        value: "TX",
      },
    ],
  };

  return { question, clicked };
}
