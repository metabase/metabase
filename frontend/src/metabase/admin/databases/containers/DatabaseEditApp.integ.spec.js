/**
 * THIS TEST WILL BE DISABLED IN PRODUCTION UNTIL METABASE-LIB IS MERGED
 * (Integrated tests need additional CI setup that I didn"t want to copy to this branch)
 */

import {
    login,
    createTestStore
} from "metabase/__support__/integrated_tests";

import React from "react";
import { mount } from "enzyme";
import {
    INITIALIZE_DATABASE,
    RESCAN_DATABASE_FIELDS,
    SYNC_DATABASE_SCHEMA,
    DISCARD_SAVED_FIELD_VALUES, addSampleDataset, DELETE_DATABASE, SAVE_DATABASE, saveDatabase, initializeDatabase
} from "metabase/admin/databases/database";
import DatabaseEditApp, { Tab } from "metabase/admin/databases/containers/DatabaseEditApp";
import DatabaseEditForms from "metabase/admin/databases/components/DatabaseEditForms";
import DatabaseSchedulingForm, { SyncOption } from "metabase/admin/databases/components/DatabaseSchedulingForm";
import FormField from "metabase/components/form/FormField";
import Toggle from "metabase/components/Toggle";
import { TestModal } from "metabase/components/Modal";
import Select from "metabase/components/Select";
import ColumnarSelector from "metabase/components/ColumnarSelector";
import { getEditingDatabase } from "metabase/admin/databases/selectors";

// Currently a lot of duplication with SegmentPane tests
describe("DatabaseEditApp", () => {
    beforeAll(async () => {
        await login();
    })

    describe("Connection tab", () => {
        it("shows the connection settings for sample dataset correctly", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            expect(schedulingForm.length).toBe(1)

            dbEditApp.find(Tab).first().simulate("click");

            const editForm = dbEditApp.find(DatabaseEditForms)
            expect(editForm.length).toBe(1)
            expect(editForm.find("select").props().defaultValue).toBe("h2")
            expect(editForm.find('input[name="name"]').props().value).toBe("Sample Dataset")
            expect(editForm.find('input[name="db"]').props().value).toEqual(
                expect.stringContaining("sample-dataset.db;USER=GUEST;PASSWORD=guest")
            )

            const fullSyncField = editForm.find(FormField).filterWhere((f) => f.props().fieldName === "is_full_sync");
            expect(fullSyncField.length).toBe(1);
            expect(fullSyncField.find(Toggle).props().value).toBe(true);
        });

        it("lets you modify the connection settings", () => {
            pending();
            // should be pretty straight-forward to do using the selectors of previous test
        });
    })

    describe("Scheduling tab", () => {
        it("shows the initial scheduling settings correctly", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            expect(schedulingForm.length).toBe(1)

            expect(schedulingForm.find(Select).first().text()).toEqual("Daily");

            const syncOptions = schedulingForm.find(SyncOption);
            const syncOptionOften = syncOptions.first();

            expect(syncOptionOften.props().name).toEqual("Often");
            expect(syncOptionOften.props().selected).toEqual(true);
        });

        it("lets you change the db sync period", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            const dbSyncSelect = schedulingForm.find(Select).first()
            dbSyncSelect.simulate("click");

            const dailyOption = schedulingForm.find(ColumnarSelector).find("li").at(1).children();
            expect(dailyOption.text()).toEqual("Daily")
            dailyOption.simulate("click");

            expect(dbSyncSelect.text()).toEqual("Daily");

            schedulingForm.find('button[children="Save"]').simulate("click");

            await store.waitForActions([SAVE_DATABASE])
        });

        it("lets you change the table change frequency to Rarely", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            const dbSyncSelect = schedulingForm.find(Select).first()
            dbSyncSelect.simulate("click");

            const syncOptions = schedulingForm.find(SyncOption);
            const syncOptionRarely = syncOptions.at(1);

            expect(syncOptionRarely.props().selected).toEqual(false);
            syncOptionRarely.simulate("click");
            expect(syncOptionRarely.props().selected).toEqual(true);

            schedulingForm.find('button[children="Save"]').get(0).click();
            await store.waitForActions([SAVE_DATABASE])
        });

        it("lets you change the table change frequency to Never", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            const dbSyncSelect = schedulingForm.find(Select).first()
            dbSyncSelect.simulate("click");

            const syncOptions = schedulingForm.find(SyncOption);
            const syncOptionsNever = syncOptions.at(2);

            expect(syncOptionsNever.props().selected).toEqual(false);
            syncOptionsNever.simulate("click");
            expect(syncOptionsNever.props().selected).toEqual(true);

            schedulingForm.find('button[children="Save"]').get(0).click();
            await store.waitForActions([SAVE_DATABASE])

        });

        it("shows the modified scheduling settings correctly", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            expect(schedulingForm.length).toBe(1)

            expect(schedulingForm.find(Select).first().text()).toEqual("Hourly");

            const syncOptions = schedulingForm.find(SyncOption);
            const syncOptionOften = syncOptions.first();
            const syncOptionNever = syncOptions.at(2);
            expect(syncOptionOften.props().selected).toEqual(false);
            expect(syncOptionNever.props().selected).toEqual(true);
        })

        afterAll(async () => {
            // revert all changes that have been made
            // use a direct API call for the sake of simplicity / reliability
            const store = await createTestStore()
            const database = (await store.dispatch(initializeDatabase(1))).payload
            await store.dispatch(saveDatabase(
                // reset to "Often" setting for field fingerprinting
                { ...database, is_full_sync: true },
                { ...database.details, is_static: false }
            ))
        })
    })

    describe("Actions sidebar", () => {
        it("lets you trigger the manual database schema sync", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            dbEditApp.find(".Button--syncDbSchema").simulate("click")
            await store.waitForActions([SYNC_DATABASE_SCHEMA])
            // TODO: do we have any way to see that the sync is actually in progress in the backend?
        });

        it("lets you trigger the manual rescan of field values", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            dbEditApp.find(".Button--rescanFieldValues").simulate("click")
            await store.waitForActions([RESCAN_DATABASE_FIELDS])
            // TODO: do we have any way to see that the field rescanning is actually in progress in the backend?
        });

        it("lets you discard saved field values", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            dbEditApp.find(".Button--discardSavedFieldValues").simulate("click")
            dbEditApp.find(TestModal).find(".Button--danger").simulate("click");
            await store.waitForActions([DISCARD_SAVED_FIELD_VALUES])
        })

        // Disabled because removal&recovery causes the db id to change
        it("lets you remove the dataset", () => {
            pending();

            // const store = await createTestStore()
            // store.pushPath("/admin/databases/1");
            // const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            // await store.waitForActions([INITIALIZE_DATABASE])
            //
            // try {
            //     dbEditApp.find(".Button--deleteDatabase").simulate("click")
            //     console.log(dbEditApp.debug());
            //     await store.waitForActions([DELETE_DATABASE])
            //     await store.dispatch(addSampleDataset())
            // } catch(e) {
            //     throw e;
            // } finally {
            // }
        });
    })
});
