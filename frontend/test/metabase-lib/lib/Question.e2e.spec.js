import {
  SAMPLE_DATASET,
  ORDERS,
  metadata,
} from "__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { useSharedAdminLogin } from "__support__/e2e";
import { NATIVE_QUERY_TEMPLATE } from "metabase-lib/lib/queries/NativeQuery";

// TODO Atte Keinänen 6/22/17: This could include tests that run each "question drill action" (summarize etc)
// and check that the result is correct

describe("Question", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("with SQL questions", () => {
    it("should return correct result with a static template tag parameter", async () => {
      const templateTagName = "orderid";
      const templateTagId = "f1cb12ed3-8727-41b6-bbb4-b7ba31884c30";
      const question = Question.create({
        databaseId: SAMPLE_DATASET.id,
        tableId: ORDERS.id,
        metadata,
      }).setDatasetQuery({
        ...NATIVE_QUERY_TEMPLATE,
        database: SAMPLE_DATASET.id,
        native: {
          query: `SELECT SUBTOTAL FROM ORDERS WHERE id = {{${templateTagName}}}`,
          "template-tags": {
            [templateTagName]: {
              id: templateTagId,
              name: templateTagName,
              display_name: "Order ID",
              type: "number",
            },
          },
        },
      });

      // Without a template tag the query should fail
      const results1 = await question.apiGetResults({ ignoreCache: true });
      expect(results1[0].status).toBe("failed");

      question._parameterValues = { [templateTagId]: "5" };
      const results2 = await question.apiGetResults({ ignoreCache: true });
      expect(results2[0]).toBeDefined();
      expect(results2[0].data.rows[0][0]).toEqual(127.88197029833711);
    });

    it("should return correct result with an optional template tag clause", async () => {
      const templateTagName = "orderid";
      const templateTagId = "f1cb12ed3-8727-41b6-bbb4-b7ba31884c30";
      const question = Question.create({
        databaseId: SAMPLE_DATASET.id,
        tableId: ORDERS.id,
        metadata,
      }).setDatasetQuery({
        ...NATIVE_QUERY_TEMPLATE,
        database: SAMPLE_DATASET.id,
        native: {
          query: `SELECT SUBTOTAL FROM ORDERS [[WHERE id = {{${templateTagName}}}]]`,
          "template-tags": {
            [templateTagName]: {
              id: templateTagId,
              name: templateTagName,
              display_name: "Order ID",
              type: "number",
            },
          },
        },
      });

      const results1 = await question.apiGetResults({ ignoreCache: true });
      expect(results1[0]).toBeDefined();
      expect(results1[0].data.rows.length).toEqual(2000);

      question._parameterValues = { [templateTagId]: "5" };
      const results2 = await question.apiGetResults({ ignoreCache: true });
      expect(results2[0]).toBeDefined();
      expect(results2[0].data.rows[0][0]).toEqual(127.88197029833711);
    });
  });
});
