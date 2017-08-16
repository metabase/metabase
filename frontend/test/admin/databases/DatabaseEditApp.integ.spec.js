/**
 * THIS TEST WILL BE DISABLED IN PRODUCTION UNTIL METABASE-LIB IS MERGED
 * (Integrated tests need additional CI setup that I didn"t want to copy to this branch)
 */

import {
    login,
    createTestStore
} from "__support__/integrated_tests";

import React from "react";
import { mount } from "enzyme";
import {
    INITIALIZE_DATABASE,
    RESCAN_DATABASE_FIELDS,
    SYNC_DATABASE_SCHEMA,
    DISCARD_SAVED_FIELD_VALUES,
    UPDATE_DATABASE,
    saveDatabase,
    initializeDatabase
} from "metabase/admin/databases/database";
import DatabaseEditApp, { Tab } from "metabase/admin/databases/containers/DatabaseEditApp";
import DatabaseEditForms from "metabase/admin/databases/components/DatabaseEditForms";
import DatabaseSchedulingForm, { SyncOption } from "metabase/admin/databases/components/DatabaseSchedulingForm";
import FormField from "metabase/components/form/FormField";
import Toggle from "metabase/components/Toggle";
import { TestModal } from "metabase/components/Modal";
import Select from "metabase/components/Select";
import ColumnarSelector from "metabase/components/ColumnarSelector";
import { click, clickButton } from "__support__/enzyme_utils";
import { MetabaseApi } from "metabase/services";

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

            const editForm = dbEditApp.find(DatabaseEditForms)
            expect(editForm.length).toBe(1)
            expect(editForm.find("select").props().defaultValue).toBe("h2")
            expect(editForm.find('input[name="name"]').props().value).toBe("Sample Dataset")
            expect(editForm.find('input[name="db"]').props().value).toEqual(
                expect.stringContaining("sample-dataset.db;USER=GUEST;PASSWORD=guest")
            )

            const letUserControlSchedulingField =
                editForm.find(FormField).filterWhere((f) => f.props().fieldName === "let-user-control-scheduling");
            expect(letUserControlSchedulingField.length).toBe(1);
            expect(letUserControlSchedulingField.find(Toggle).props().value).toBe(false);
        });

        it("lets you modify the connection settings", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            const editForm = dbEditApp.find(DatabaseEditForms)
            const letUserControlSchedulingField =
                editForm.find(FormField).filterWhere((f) => f.props().fieldName === "let-user-control-scheduling");
            click(letUserControlSchedulingField.find(Toggle))

            // Connection and Scheduling tabs shouldn't be visible yet
            expect(dbEditApp.find(Tab).length).toBe(0)

            clickButton(editForm.find('button[children="Save"]'));

            await store.waitForActions([UPDATE_DATABASE])

            // Tabs should be now visible as user-controlled scheduling is enabled
            expect(dbEditApp.find(Tab).length).toBe(2)
        });

        afterAll(async () => {
            // revert all changes that have been made
            // use a direct API call for the sake of simplicity / reliability
            const store = await createTestStore()
            const database = (await store.dispatch(initializeDatabase(1))).payload
            await store.dispatch(saveDatabase(database, {
                    ...database.details,
                    "let-user-control-scheduling": false
                }
            ))
        })
    })

    describe("Scheduling tab", () => {
        beforeAll(async () => {
            // Enable the user-controlled scheduling for these tests
            const store = await createTestStore()
            const database = (await store.dispatch(initializeDatabase(1))).payload
            await store.dispatch(saveDatabase(database, {
                    ...database.details,
                    "let-user-control-scheduling": true
                }
            ))
        })

        it("shows the initial scheduling settings correctly", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            const editForm = dbEditApp.find(DatabaseEditForms)
            expect(editForm.length).toBe(1)
            click(dbEditApp.find(Tab).last());

            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            expect(schedulingForm.length).toBe(1)

            expect(schedulingForm.find(Select).first().text()).toEqual("Hourly");

            const syncOptions = schedulingForm.find(SyncOption);
            const syncOptionOften = syncOptions.first();

            expect(syncOptionOften.props().name).toEqual("Regularly");
            expect(syncOptionOften.props().selected).toEqual(true);
        });

        it("lets you change the db sync period", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            click(dbEditApp.find(Tab).last());
            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            const dbSyncSelect = schedulingForm.find(Select).first()
            click(dbSyncSelect)

            const dailyOption = schedulingForm.find(ColumnarSelector).find("li").at(1).children();
            expect(dailyOption.text()).toEqual("Daily")
            click(dailyOption);

            expect(dbSyncSelect.text()).toEqual("Daily");

            clickButton(schedulingForm.find('button[children="Save changes"]'));

            await store.waitForActions([UPDATE_DATABASE])
        });

        it("lets you change the table change frequency to Never", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            click(dbEditApp.find(Tab).last())
            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            const dbSyncSelect = schedulingForm.find(Select).first()
            click(dbSyncSelect)

            const syncOptions = schedulingForm.find(SyncOption);
            const syncOptionsNever = syncOptions.at(1);

            expect(syncOptionsNever.props().selected).toEqual(false);
            click(syncOptionsNever)
            expect(syncOptionsNever.props().selected).toEqual(true);

            clickButton(schedulingForm.find('button[children="Save changes"]'));
            await store.waitForActions([UPDATE_DATABASE])

        });

        it("shows the modified scheduling settings correctly", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            click(dbEditApp.find(Tab).last())
            const schedulingForm = dbEditApp.find(DatabaseSchedulingForm)
            expect(schedulingForm.length).toBe(1)

            expect(schedulingForm.find(Select).first().text()).toEqual("Daily");

            const syncOptions = schedulingForm.find(SyncOption);
            const syncOptionOften = syncOptions.first();
            const syncOptionNever = syncOptions.at(1);
            expect(syncOptionOften.props().selected).toEqual(false);
            expect(syncOptionNever.props().selected).toEqual(true);
        })

        afterAll(async () => {
            // revert all changes that have been made
            // use a direct API call for the sake of simplicity / reliability
            const store = await createTestStore()
            const database = (await store.dispatch(initializeDatabase(1))).payload
            await store.dispatch(saveDatabase(
                {
                    ...database,
                    is_full_sync: true,
                    schedules: {
                        "cache_field_values": {
                            "schedule_day": null,
                            "schedule_frame": null,
                            "schedule_hour": null,
                            "schedule_type": "hourly"
                        },
                        "metadata_sync": {
                            "schedule_day": null,
                            "schedule_frame": null,
                            "schedule_hour": null,
                            "schedule_type": "hourly"
                        }
                    }
                },
                {
                    ...database.details,
                    "let-user-control-scheduling": false
                }
            ))
        })
    })

    describe("Actions sidebar", () => {
        it("lets you trigger the manual database schema sync", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            clickButton(dbEditApp.find(".Button--syncDbSchema"))
            await store.waitForActions([SYNC_DATABASE_SCHEMA])
            // TODO: do we have any way to see that the sync is actually in progress in the backend?
        });

        it("lets you trigger the manual rescan of field values", async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            clickButton(dbEditApp.find(".Button--rescanFieldValues"))
            await store.waitForActions([RESCAN_DATABASE_FIELDS])
            // TODO: do we have any way to see that the field rescanning is actually in progress in the backend?
        });

        // TODO Atte Keinänen 8/15/17: Does losing field values potentially cause test failures in other test suites?
        it("lets you discard saved field values", async () => {
            // To be safe, let's mock the API method
            MetabaseApi.db_discard_values = jest.fn();
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");
            const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
            await store.waitForActions([INITIALIZE_DATABASE])

            click(dbEditApp.find(".Button--discardSavedFieldValues"))
            clickButton(dbEditApp.find(TestModal).find(".Button--danger"))
            await store.waitForActions([DISCARD_SAVED_FIELD_VALUES])

            expect(MetabaseApi.db_discard_values.mock.calls.length).toBe(1);
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
            //     click(dbEditApp.find(".Button--deleteDatabase"))
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
