/* eslint-disable flowtype/require-valid-file-annotation */

import {
  DATABASE_ID,
  ORDERS_TABLE_ID,
  metadata,
} from "__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { useSharedAdminLogin } from "__support__/integrated_tests";

describe("PivotByCategoryDrill", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  it("should return a result for Order count pivoted by Subtotal", async () => {
    // NOTE: Using the fixture metadata for now because trying to load the metadata involves a lot of Redux magic
    const question = Question.create({
      databaseId: DATABASE_ID,
      tableId: ORDERS_TABLE_ID,
      metadata,
    })
      .query()
      .addAggregation(["count"])
      .question();

    const pivotedQuestion = question.pivot([["field-id", 4]]);

    const results = await pivotedQuestion.apiGetResults();
    expect(results[0]).toBeDefined();
  });
});
