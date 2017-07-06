/* @flow weak */

import { DATABASE_ID, ORDERS_TABLE_ID, metadata } from "metabase/__support__/sample_dataset_fixture";
import { login, startServer, stopServer } from "metabase/__support__/integrated_tests";

describe("Testing testing", () => {
    beforeAll(async () => {
        await startServer();
        await login();
    })

   it("do stuff", async () => {
        expect(true).toBe(true);
    })

    afterAll(async () => {
        await stopServer();
    })
});