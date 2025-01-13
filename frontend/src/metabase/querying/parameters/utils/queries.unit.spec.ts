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
  const filterableColumns = Lib.filterableColumns(query, stageIndex);
  const findFilterableColumn = columnFinder(query, filterableColumns);

  function getFilterColumnTarget(
    tableName: string,
    columnName: string,
  ): ParameterTarget {
    const column = findFilterableColumn(tableName, columnName);
    const columnRef = Lib.legacyRef(query, stageIndex, column);
    return ["dimension", columnRef] as ParameterTarget;
  }

  it.each<FilterParameterCase>([
    {
      type: "category",
      target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
      value: "Gadget",
      expectedDisplayName: "Category is Gadget",
    },
    {
      type: "string/=",
      target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
      value: "Widget",
      expectedDisplayName: "Category is Widget",
    },
    {
      type: "string/=",
      target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
      value: ["Widget", "Gadget"],
      expectedDisplayName: "Category is 2 selections",
    },
    {
      type: "string/!=",
      target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
      value: ["Widget"],
      expectedDisplayName: "Category is not Widget",
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
