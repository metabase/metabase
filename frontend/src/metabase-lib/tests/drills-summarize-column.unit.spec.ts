import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createColumnClickObject,
  createQuery,
  createRawCellClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createNotEditableQuery,
  createOrdersStructuredDatasetColumn,
  createOrdersStructuredField,
} from "./drills-common";

describe("drill-thru/summarize-column", () => {
  const drillType = "drill-thru/summarize-column";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersTotalDatasetColumn();

  it.each<Lib.SummarizeColumnDrillThruOperator>(["distinct", "sum", "avg"])(
    'should drill thru a summable column and "%s" operator',
    operator => {
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });
      const { drill, drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        aggregations: ["distinct", "sum", "avg"],
      });

      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill, operator);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
    },
  );

  it('should drill thru a non-summable column and "distinct" operator', () => {
    const clickedObject = createColumnClickObject({
      column: createOrdersCreatedAtDatasetColumn(),
    });
    const { drill, drillInfo } = findDrillThru(
      defaultQuery,
      stageIndex,
      clickedObject,
      drillType,
    );
    expect(drillInfo).toMatchObject({
      aggregations: ["distinct"],
    });

    const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill, "distinct");
    expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
  });

  it("should not drill thru a cell", () => {
    const clickObject = createRawCellClickObject({
      column: defaultColumn,
      value: null,
    });
    const drill = queryDrillThru(
      defaultQuery,
      stageIndex,
      clickObject,
      drillType,
    );
    expect(drill).toBeNull();
  });

  it("should not drill thru a Structured column", () => {
    const metadata = createMockMetadata({
      databases: [
        createSampleDatabase({
          tables: [
            createOrdersTable({
              fields: [createOrdersIdField(), createOrdersStructuredField()],
            }),
          ],
        }),
      ],
    });
    const query = createQuery({ metadata });
    const column = createOrdersStructuredDatasetColumn();
    const clickObject = createColumnClickObject({ column });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("should not drill thru a non-editable query (metabase#36125)", () => {
    const query = createNotEditableQuery(defaultQuery);
    const clickObject = createColumnClickObject({
      column: defaultColumn,
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });
});
