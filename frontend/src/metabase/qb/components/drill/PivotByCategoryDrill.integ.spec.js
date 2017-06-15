/* @flow weak */

import { BackendResource } from "../../../../../test/e2e/support/backend.js";
import api from "metabase/lib/api";
import { SessionApi } from "metabase/services";
import { METABASE_SESSION_COOKIE } from "metabase/lib/cookies";
import { DATABASE_ID, ORDERS_TABLE_ID, metadata } from "metabase/__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";

var loginSession = null;
api._makeRequest = async (method, url, headers, body, data, options) => {
    const headersWithSessionCookie = {
        ...headers,
        ...(loginSession ? {"Cookie": `${METABASE_SESSION_COOKIE}=${loginSession.id}`} : {})
    }

    const fetchOptions = {
        credentials: "include",
        method,
        headers: new Headers(headersWithSessionCookie),
        ...(body ? {body} : {})
    };

    const result = await fetch(api.basename + url, fetchOptions);
    if (result.status >= 200 && result.status <= 299) {
        return result.json();
    } else {
        throw { status: result.status, data: result.json() }
    }
}
async function login() {
    loginSession = await SessionApi.create({ email: "bob@metabase.com", password: "12341234"});
}

let server = BackendResource.get({});
api.basename = server.host;

// TODO: How to have the high timeout interval only for integration tests?
// or even better, just for the setup/teardown of server process?
jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

describe("PivotByCategoryDrill", () => {
    beforeAll(async () => {
        await BackendResource.start(server);
        await login();
    })

   it("should return a result for Order count pivoted by Subtotal", async () => {
        // NOTE: Using the fixture metadata for now because trying to load the metadata involves a lot of Redux magic
        const question = Question.create({ databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata })
            .query()
            .addAggregation(["count"])
            .question()

        const pivotedQuestion = question.pivot(["field-id", 4], [])

        const results = await pivotedQuestion.getResults()
        expect(results[0]).toBeDefined();
    })

    afterAll(async () => {
        // For making test running more FUN
        // await BackendResource.stop(server);
    })
});
