import {
    DATABASE_ID, ORDERS_TABLE_ID, metadata,
    ORDERS_TOTAL_FIELD_ID
} from "metabase/__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { parse as urlParse } from "url";
import {
    login,
    startServer,
    stopServer,
    globalReduxStore as store,
    browserHistory
} from "metabase/__support__/integrated_tests";
import { initializeQB } from "./actions";
import { getCard, getOriginalCard } from "./selectors";
import { CardApi } from "metabase/services";
import { refreshSiteSettings } from "metabase/redux/settings";

jest.mock('metabase/lib/analytics');


describe("QueryBuilder", () => {
    let unsavedQuestion: Question = null;
    let savedCleanQuestion: Question = null;
    let dirtyQuestion: Question = null;

    beforeAll(async () => {
        await startServer();
        await login();
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
        describe("initializeQb", () => {
            it("should complete successfully", async () => {
                const location = urlParse(unsavedQuestion.getUrl())
                await store.dispatch(initializeQB(location, {}))
            });

            it("should result in the correct card object in redux state", async () => {
                expect(getCard(store.getState())).toMatchObject(unsavedQuestion.card())
            })

            it("should result in an empty original_card object in redux state", async () => {
                expect(getOriginalCard(store.getState())).toEqual(null)
            })

            it("should keep the url same after initialization is finished", async () => {
                const location = urlParse(unsavedQuestion.getUrl())

                // can't get the location from Redux state for some reason so just query the emulated history object directly
                expect(browserHistory.getCurrentLocation().pathname).toBe(location.pathname)
                expect(browserHistory.getCurrentLocation().hash).toBe(location.hash)
            })
        })
    })

    describe("for saved questions", async () => {
        describe("with clean state", () => {
            describe("initializeQb", () => {
                it("should complete successfully", async () => {
                    const location = urlParse(savedCleanQuestion.getUrl(savedCleanQuestion))
                    // pass the card id explicitly as we are not using react-router parameter resolution here
                    await store.dispatch(initializeQB(location, { cardId: savedCleanQuestion.id() }))
                });

                it("should result in the correct card object in redux state", async() => {
                    expect(getCard(store.getState())).toMatchObject(savedCleanQuestion.card())
                })

                it("should result in the correct original_card object in redux state", async() => {
                    expect(getOriginalCard(store.getState())).toMatchObject(savedCleanQuestion.card())
                })
                it("should keep the url same after initialization is finished", async () => {
                    const location = urlParse(savedCleanQuestion.getUrl(savedCleanQuestion))

                    // can't get the location from Redux state for some reason so just query the emulated history object directly
                    expect(browserHistory.getCurrentLocation().pathname).toBe(location.pathname)
                    expect(browserHistory.getCurrentLocation().hash).toBe(location.hash || "")
                })
            })
        })

        describe("with dirty state", () => {
            describe("initializeQb", () => {
                it("should complete successfully", async () => {
                    const location = urlParse(dirtyQuestion.getUrl(savedCleanQuestion))
                    await store.dispatch(initializeQB(location, {}))
                });

                it("should result in the correct card object in redux state", async() => {
                    expect(dirtyQuestion.card()).toMatchObject(getCard(store.getState()))
                })

                it("should result in the correct original_card object in redux state", async() => {
                    expect(getOriginalCard(store.getState())).toMatchObject(savedCleanQuestion.card())
                })
                it("should keep the url same after initialization is finished", async () => {
                    const location = urlParse(dirtyQuestion.getUrl(savedCleanQuestion))

                    // can't get the location from Redux state for some reason so just query the emulated history object directly
                    expect(browserHistory.getCurrentLocation().pathname).toBe(location.pathname)
                    expect(browserHistory.getCurrentLocation().hash).toBe(location.hash || "")
                })
            })
        })
    });

    afterAll(async () => {
        await stopServer();
    })
});
