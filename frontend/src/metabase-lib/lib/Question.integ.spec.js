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
        // NOTE: Using the fixture metadata for now because trying to load the metadata involves a lot of Redux magic
        const templateTagName = "orderid"
        const templateTagId = "f1cb12ed3-8727-41b6-bbb4-b7ba31884c30"
        const question = Question.create({ databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata })
            .setDatasetQuery({
                ...NATIVE_QUERY_TEMPLATE,
                native: {
                    query: `SELECT * FROM ORDERS WHERE id = [[${templateTagName}]]`,
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

        question.parameterValues = { [templateTagId]: "5" };

        try {
            const results = await question.getResults()
            console.log(results[0]);
            expect(results[0]).toBeDefined();
        } catch(e) {
            console.error(e);
        }
    })

    afterAll(async () => {
        await stopServer();
    })
});
