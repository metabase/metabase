import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import type {
  ParameterTarget,
  ParameterType,
  ParameterValueOrArray,
} from "metabase-types/api";

import { applyParameter } from "./queries";

type FilterParameterCase = {
  type: ParameterType;
  target: ParameterTarget;
  value: ParameterValueOrArray;
  expectedDisplayName: string;
};

describe("applyParameter", () => {
  const query = createQuery();
  const stageIndex = 0;

  function getColumnTarget(
    tableName: string,
    columnName: string,
  ): ParameterTarget {
    const columns = Lib.filterableColumns(query, stageIndex);
    const findColumn = columnFinder(query, columns);
    const column = findColumn(tableName, columnName);
    const columnRef = Lib.legacyRef(query, stageIndex, column);
    return ["dimension", columnRef] as ParameterTarget;
  }

  it.each<FilterParameterCase>([
    {
      type: "category",
      target: getColumnTarget("PRODUCTS", "CATEGORY"),
      value: "Gadget",
      expectedDisplayName: "Category is Gadget",
    },
  ])(
    "should apply a filter parameter",
    ({ type, target, value, expectedDisplayName }) => {
      const newQuery = applyParameter(query, stageIndex, type, target, value);
      const [newFilter] = Lib.filters(newQuery, stageIndex);
      expect(Lib.displayInfo(newQuery, stageIndex, newFilter)).toMatchObject({
        displayName: expectedDisplayName,
      });
    },
  );
});
