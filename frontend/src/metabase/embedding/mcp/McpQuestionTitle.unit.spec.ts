import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getMcpQuestionTitle } from "./McpQuestionTitle";

const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
      breakouts: [
        {
          type: "column",
          name: "CREATED_AT",
          sourceName: "ORDERS",
          unit: "month",
        },
      ],
    },
  ],
});

const question = Question.create({
  metadata: SAMPLE_METADATA,
}).setQuery(query);

describe("getMcpQuestionTitle", () => {
  it("uses a generated question description without temporal buckets", () => {
    expect(getMcpQuestionTitle(question)).toBe("Count by Created At");
  });
});
