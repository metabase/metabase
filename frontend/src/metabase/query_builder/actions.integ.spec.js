import {
    DATABASE_ID, ORDERS_TABLE_ID, metadata,
    ORDERS_TOTAL_FIELD_ID
} from "metabase/__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { parse as urlParse } from "url";
import {
    login,
    globalReduxStore as store,
    globalBrowserHistory as history
} from "metabase/__support__/integrated_tests";
import { initializeQB } from "./actions";
import { getCard, getOriginalCard, getQueryResults } from "./selectors";
import { CardApi } from "metabase/services";
import { refreshSiteSettings } from "metabase/redux/settings";

jest.mock('metabase/lib/analytics');


describe("QueryBuilder", () => {
    let unsavedQuestion: Question = null;
    let savedCleanQuestion: Question = null;
    let dirtyQuestion: Question = null;

    beforeAll(async () => {
        await login();
    })

    describe("initializeQb", () => {
        beforeAll(async () => {
            // Question initialization has to be in beforeAll block due to the CardApi.create api call
            await store.dispatch(refreshSiteSettings());

            unsavedQuestion = Question.create({databaseId: DATABASE_ID, tableId: ORDERS_TABLE_ID, metadata})
                .query()
                .addAggregation(["count"])
                .question()

            unsavedQuestion._card = { ...unsavedQuestion._card, name: "Order count" }

            const savedCleanQuestionCard = await CardApi.create(unsavedQuestion.card())
            savedCleanQuestion = unsavedQuestion.setCard({
                ...savedCleanQuestionCard
            });

            dirtyQuestion = savedCleanQuestion
                .query()
                .addBreakout(["field-id", ORDERS_TOTAL_FIELD_ID])
                .question()

            dirtyQuestion._card = { ...dirtyQuestion._card, original_card_id: dirtyQuestion.id() }
        })

        describe("for unsaved questions", () => {
            it("completes successfully", async () => {
                const location = urlParse(unsavedQuestion.getUrl())
                await store.dispatch(initializeQB(location, {}))
            });

            it("results in the correct card object in redux state", async () => {
                expect(getCard(store.getState())).toMatchObject(unsavedQuestion.card())
            })

            it("results in an empty original_card object in redux state", async () => {
                expect(getOriginalCard(store.getState())).toEqual(null)
            })

            it("keeps the url same after initialization is finished", async () => {
                const location = urlParse(unsavedQuestion.getUrl())

                // can't get the location from Redux state for some reason so just query the emulated history object directly
                expect(history.getCurrentLocation().pathname).toBe(location.pathname)
                expect(history.getCurrentLocation().hash).toBe(location.hash)
            })

            // TODO: setTimeout for
            xit("fetches the query results", async () => {
                expect(getQueryResults(store.getState()) !== null).toBe(true)
            })
        })
        describe("for saved questions", async () => {
            describe("with clean state", () => {
                it("completes successfully", async () => {
                    const location = urlParse(savedCleanQuestion.getUrl(savedCleanQuestion))
                    // pass the card id explicitly as we are not using react-router parameter resolution here
                    await store.dispatch(initializeQB(location, {cardId: savedCleanQuestion.id()}))
                });

                it("results in the correct card object in redux state", async () => {
                    expect(getCard(store.getState())).toMatchObject(savedCleanQuestion.card())
                })

                it("results in the correct original_card object in redux state", async () => {
                    expect(getOriginalCard(store.getState())).toMatchObject(savedCleanQuestion.card())
                })
                it("keeps the url same after initialization is finished", async () => {
                    const location = urlParse(savedCleanQuestion.getUrl(savedCleanQuestion))

                    // can't get the location from Redux state for some reason so just query the emulated history object directly
                    expect(history.getCurrentLocation().pathname).toBe(location.pathname)
                    expect(history.getCurrentLocation().hash).toBe(location.hash || "")
                })
            })
            describe("with dirty state", () => {
                it("completes successfully", async () => {
                    const location = urlParse(dirtyQuestion.getUrl(savedCleanQuestion))
                    await store.dispatch(initializeQB(location, {}))
                });

                it("results in the correct card object in redux state", async () => {
                    expect(dirtyQuestion.card()).toMatchObject(getCard(store.getState()))
                })

                it("results in the correct original_card object in redux state", async () => {
                    expect(getOriginalCard(store.getState())).toMatchObject(savedCleanQuestion.card())
                })
                it("keeps the url same after initialization is finished", async () => {
                    const location = urlParse(dirtyQuestion.getUrl(savedCleanQuestion))

                    // can't get the location from Redux state for some reason so just query the emulated history object directly
                    expect(history.getCurrentLocation().pathname).toBe(location.pathname)
                    expect(history.getCurrentLocation().hash).toBe(location.hash || "")
                })
            })
        })
    })

    describe("runQuestionQuery", () => {
        it("returns the correct query results for a valid query", () => {
            pending();
        })
        it("returns a correctly formatted error for invalid queries", () => {
            pending();
        })

        // TODO: This would be really good to test but not exactly sure how
        xit("ignores cache when `{ignoreCache = true}`", () => {
            pending();
        })

        it("can be cancelled with `cancelQueryDeferred`", () => {
            pending();
        })
    })

    describe("navigateToNewCardInsideQB", () => {
        // The full drill-trough flow including navigateToNewCardInsideQB is tested in Visualization.spec.js
    })
});
