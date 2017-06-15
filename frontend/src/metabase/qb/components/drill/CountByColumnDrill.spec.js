/* eslint-disable flowtype/require-valid-file-annotation */

import CountByColumnDrill from "./CountByColumnDrill";

import {
    productQuestion,
    clickedCategoryHeader,
    PRODUCT_TABLE_ID,
    PRODUCT_CATEGORY_FIELD_ID
} from "metabase/__support__/sample_dataset_fixture";

import { BackendResource } from "../../../../../test/e2e/support/backend.js";
let server = BackendResource.get({});

// TODO: How to have the high timeout interval only for integration tests?
// or even better, just for the setup/teardown of server process?
jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

describe("CountByColumnDrill", () => {
    describe("behavioral integration tests", () => {
        beforeAll(async () => {
            await BackendResource.start(server);
        })

        it("should be able to access the backend", async () => {
            let responseJson = await (await fetch(`${server.host}/api/health`)).json();
            expect(responseJson).toEqual({ "status": "ok" });
        })

        afterAll(async () => {
            await BackendResource.stop(server);
        })
    })

    describe("unit tests", () => {
        it("should not be valid for top level actions", () => {
            expect(CountByColumnDrill({ productQuestion })).toHaveLength(0);
        });
        it("should be valid for click on numeric column header", () => {
            expect(
                CountByColumnDrill({
                    question: productQuestion,
                    clicked: clickedCategoryHeader
                })
            ).toHaveLength(1);
        });
        it("should be return correct new card", () => {
            const actions = CountByColumnDrill({
                question: productQuestion,
                clicked: clickedCategoryHeader
            });
            expect(actions).toHaveLength(1);
            const newCard = actions[0].question().card();
            expect(newCard.dataset_query.query).toEqual({
                source_table: PRODUCT_TABLE_ID,
                aggregation: [["count"]],
                breakout: [["field-id", PRODUCT_CATEGORY_FIELD_ID]]
            });
            expect(newCard.display).toEqual("bar");
        });
    })
});
