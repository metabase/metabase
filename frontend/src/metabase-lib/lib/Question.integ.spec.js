/* @flow weak */

import { DATABASE_ID, ORDERS_TABLE_ID, metadata } from "metabase/__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { login, startServer, stopServer } from "metabase/__support__/integrated_tests";
import { NATIVE_QUERY_TEMPLATE } from "metabase-lib/lib/queries/NativeQuery";

describe("Question", () => {
    beforeAll(async () => {
        await startServer();
        await login();
    })

    it("should return correct result for a SQL question with template tag parameters", async () => {
        const templateTagName = "orderid"
        const templateTagId = "f1cb12ed3-8727-41b6-bbb4-b7ba31884c30"
        const question = Question.create({ databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata })
            .setDatasetQuery({
                ...NATIVE_QUERY_TEMPLATE,
                database: DATABASE_ID,
                native: {
                    query: `SELECT SUBTOTAL FROM ORDERS WHERE id = {{${templateTagName}}}`,
                    template_tags: {
                        [templateTagName]: {
                            id: templateTagId,
                            name: templateTagName,
                            display_name: "Order ID",
                            type: "number"
                        }
                    }
                }
            })

        question._parameterValues = { [templateTagId]: "5" };

        const results = await question.getResults({ignoreCache: true})
        expect(results[0]).toBeDefined();
        expect(results[0].data.rows[0][0]).toEqual(18.1);
    })

    afterAll(async () => {
        await stopServer();
    })
});
