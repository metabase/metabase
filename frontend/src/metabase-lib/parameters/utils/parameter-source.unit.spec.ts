import { ValuesQueryType } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import {
  canListParameterValues,
  canSearchParameterValues,
} from "./parameter-source";

describe("parameter source", () => {
  it.each<[ValuesQueryType, boolean]>([
    ["list", true],
    ["search", false],
    ["none", false],
  ])("should handle %s query type when listing", (queryType, canList) => {
    const parameter = createMockParameter({
      values_query_type: queryType,
    });

    expect(canListParameterValues(parameter)).toBe(canList);
  });

  it.each<[ValuesQueryType, boolean]>([
    ["list", true],
    ["search", true],
    ["none", false],
  ])("should handle %s query type when searching", (queryType, canSearch) => {
    const parameter = createMockParameter({
      values_query_type: queryType,
    });

    expect(canSearchParameterValues(parameter)).toBe(canSearch);
  });
});
