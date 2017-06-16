/* @flow weak */

import { DATABASE_ID, ORDERS_TABLE_ID, metadata } from "metabase/__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import SummarizeBySegmentMetricAction from "./SummarizeBySegmentMetricAction"
import { login, startServer, stopServer } from "metabase/__support__/integrated_tests";
import { mount } from "enzyme";

const question = Question.create({ databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata })

describe("SummarizeBySegmentMetricAction", () => {
    beforeAll(async () => {
        await startServer();
        await login();
    })
    afterAll(async () => {
        await stopServer();
    })

    it("should return a query with correct result for 'Count of rows' choice", async () => {
        const action = SummarizeBySegmentMetricAction({ question })[0]

        await new Promise((resolve, reject) => {
            const popover = action.popover({
                onClose: () => {},
                onChangeCardAndRun: async (card) => {
                    const summarizedQuestion = new Question(metadata, card);
                    expect(card).toBeDefined();

                    const results = await summarizedQuestion.getResults()
                    expect(results[0]).toBeDefined();
                    expect(results[0].data.rows[0][0]).toEqual(17624);

                    resolve();
                }
            })

            const component = mount(popover);
            component.find('.List-item-title[children="Count of rows"]').simulate("click");
        })
    })

    it("should return a result for Order raw data summarized with 'Sum of Subtotal'", async () => {
        const action = SummarizeBySegmentMetricAction({ question })[0]

        await new Promise((resolve, reject) => {
            const popover = action.popover({
                onClose: () => {},
                onChangeCardAndRun: async (card) => {
                    const summarizedQuestion = new Question(metadata, card);
                    expect(card).toBeDefined();

                    const results = await summarizedQuestion.getResults()
                    expect(results[0]).toBeDefined();
                    expect(results[0].data.rows[0][0]).toBeCloseTo(1034792.85, 2);

                    resolve();
                }
            })

            const component = mount(popover);
            component
                .find('.List-item-title[children="Sum of ..."]')
                .simulate("click");
            component
                .find('.List-item-title[children="Subtotal"]')
                .simulate("click");
            ;
        })
    })
});