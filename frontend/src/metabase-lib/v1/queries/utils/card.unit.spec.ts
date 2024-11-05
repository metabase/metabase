import type {
  DashboardParameterMapping,
  ParameterTarget,
} from "metabase-types/api";
import { createMockCard, createMockParameter } from "metabase-types/api/mocks";

import { applyParameters } from "./card";

describe("applyParameters", () => {
  const target: ParameterTarget = ["variable", ["template-tag", "tag"]];

  it.each([
    {
      title:
        "should use the target parameter default value when it is required, has a default value, and no value was supplied",
      sourceParameter: createMockParameter({
        id: "1",
        target,
        default: undefined,
        required: false,
      }),
      targetParameter: createMockParameter({
        id: "2",
        target,
        default: "default",
        required: true,
      }),
      parameterValues: {},
      expectedValue: ["default"],
    },
    {
      title:
        "should not use the target parameter default value when it is not required, has a default value, and no value was supplied",
      sourceParameter: createMockParameter({
        id: "1",
        target,
        default: undefined,
        required: false,
      }),
      targetParameter: createMockParameter({
        id: "2",
        target,
        default: "default",
        required: false,
      }),
      parameterValues: {},
      expectedValue: undefined,
    },
    {
      title:
        "should not use the target parameter default value when it is required, has a default value, but a value was supplied",
      sourceParameter: createMockParameter({
        id: "1",
        target,
        default: undefined,
        required: false,
      }),
      targetParameter: createMockParameter({
        id: "2",
        target,
        default: "default",
        required: true,
      }),
      parameterValues: { "1": "not default" },
      expectedValue: ["not default"],
    },
  ])(
    "$title",
    ({ sourceParameter, targetParameter, parameterValues, expectedValue }) => {
      const card = createMockCard({
        parameters: [targetParameter],
      });
      const parameterMappings: DashboardParameterMapping[] = [
        { card_id: card.id, parameter_id: sourceParameter.id, target },
      ];
      const query = applyParameters(
        card,
        [sourceParameter],
        parameterValues,
        parameterMappings,
      );
      expect(query.parameters).toEqual([
        {
          id: sourceParameter.id,
          type: sourceParameter.type,
          value: expectedValue,
          target,
        },
      ]);
    },
  );
});
