import {
    login,
    createTestStore, clickRouterLink,
} from "metabase/__support__/integrated_tests";

import { mount } from "enzyme";
import {
    FETCH_DATABASES,
    initializeDatabase,
    INITIALIZE_DATABASE,
    DELETE_DATABASE_FAILED,
    DELETE_DATABASE,
    CREATE_DATABASE_STARTED,
    CREATE_DATABASE_FAILED,
    CREATE_DATABASE,
    UPDATE_DATABASE_STARTED,
    UPDATE_DATABASE_FAILED,
    UPDATE_DATABASE,
} from "../database"

import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp";

import { MetabaseApi } from 'metabase/services'
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp";
import { delay } from "metabase/lib/promise"
import { getEditingDatabase } from "metabase/admin/databases/selectors";
import FormMessage, { SERVER_ERROR_MESSAGE } from "metabase/components/form/FormMessage";
import CreatedDatabaseModal from "metabase/admin/databases/components/CreatedDatabaseModal";

describe('dashboard list', () => {

    beforeAll(async () => {
        await login()
    })

    it('should render', async () => {
        const store = await createTestStore()
        store.pushPath("/admin/databases");

        const app = mount(store.getAppContainer())

        await store.waitForActions([FETCH_DATABASES])

        const wrapper = app.find(DatabaseListApp)
        expect(wrapper.length).toEqual(1)

    })

    describe('adds', () => {
        it("should work and shouldn't let you accidentally add db twice", async () => {
            MetabaseApi.db_create = async (db) => { await delay(10); return {...db, id: 10}; };

            const store = await createTestStore()
            store.pushPath("/admin/databases");

            const app = mount(store.getAppContainer())
            await store.waitForActions([FETCH_DATABASES])

            const listAppBeforeAdd = app.find(DatabaseListApp)

            const addDbButton = listAppBeforeAdd.find('.Button.Button--primary').first()
            clickRouterLink(addDbButton)

            const dbDetailsForm = app.find(DatabaseEditApp);
            expect(dbDetailsForm.length).toBe(1);

            await store.waitForActions([INITIALIZE_DATABASE]);

            expect(dbDetailsForm.find('button[children="Save"]').props().disabled).toBe(true)

            const updateInputValue = (name, value) =>
                dbDetailsForm.find(`input[name="${name}"]`).simulate('change', { target: { value } });

            updateInputValue("name", "Test db name");
            updateInputValue("dbname", "test_postgres_db");
            updateInputValue("user", "uberadmin");

            const saveButton = dbDetailsForm.find('button[children="Save"]')

            expect(saveButton.props().disabled).toBe(false)
            saveButton.simulate("submit");

            // Now the submit button should be disabled so that you aren't able to trigger the db creation action twice
            await store.waitForActions([CREATE_DATABASE_STARTED])
            expect(saveButton.text()).toBe("Saving...");
            expect(saveButton.props().disabled).toBe(true);

            await store.waitForActions([CREATE_DATABASE]);

            expect(store.getPath()).toEqual("/admin/databases?created=10")
            expect(app.find(CreatedDatabaseModal).length).toBe(1);
        })

        it('should show error correctly on failure', async () => {
            MetabaseApi.db_create = async () => {
                await delay(10);
                return Promise.reject({
                    status: 400,
                    data: {},
                    isCancelled: false
                })
            }

            const store = await createTestStore()
            store.pushPath("/admin/databases");

            const app = mount(store.getAppContainer())
            await store.waitForActions([FETCH_DATABASES])

            const listAppBeforeAdd = app.find(DatabaseListApp)

            const addDbButton = listAppBeforeAdd.find('.Button.Button--primary').first()
            clickRouterLink(addDbButton)

            const dbDetailsForm = app.find(DatabaseEditApp);
            expect(dbDetailsForm.length).toBe(1);

            await store.waitForActions([INITIALIZE_DATABASE]);

            const saveButton = dbDetailsForm.find('button[children="Save"]')
            expect(saveButton.props().disabled).toBe(true)

            const updateInputValue = (name, value) =>
                dbDetailsForm.find(`input[name="${name}"]`).simulate('change', { target: { value } });

            updateInputValue("name", "Test db name");
            updateInputValue("dbname", "test_postgres_db");
            updateInputValue("user", "uberadmin");

            expect(saveButton.props().disabled).toBe(false)
            saveButton.simulate("submit");

            await store.waitForActions([CREATE_DATABASE_STARTED])
            expect(saveButton.text()).toBe("Saving...");

            await store.waitForActions([CREATE_DATABASE_FAILED]);
            expect(dbDetailsForm.find(FormMessage).text()).toEqual(SERVER_ERROR_MESSAGE);
            expect(saveButton.text()).toBe("Save");
        });
    })

    describe('deletes', () => {
        it('should not block deletes', async () => {
            MetabaseApi.db_delete = async () => await delay(10)

            const store = await createTestStore()
            store.pushPath("/admin/databases");

            const app = mount(store.getAppContainer())
            await store.waitForActions([FETCH_DATABASES])

            const wrapper = app.find(DatabaseListApp)
            const dbCount = wrapper.find('tr').length

            const deleteButton = wrapper.find('.Button.Button--danger').first()

            deleteButton.simulate('click')

            const deleteModal = wrapper.find('.test-modal')
            deleteModal.find('.Form-input').simulate('change', { target: { value: "DELETE" }})
            deleteModal.find('.Button.Button--danger').simulate('click')

            // test that the modal is gone
            expect(wrapper.find('.test-modal').length).toEqual(0)

            // we should now have a disabled db row during delete
            expect(wrapper.find('tr.disabled').length).toEqual(1)

            // db delete finishes
            await store.waitForActions([DELETE_DATABASE])

            // there should be no disabled db rows now
            expect(wrapper.find('tr.disabled').length).toEqual(0)

            // we should now have one database less in the list
            expect(wrapper.find('tr').length).toEqual(dbCount - 1)
        })

        it('should show error correctly on failure', async () => {
            MetabaseApi.db_delete = async () => {
                await delay(10);
                return Promise.reject({
                    status: 400,
                    data: {},
                    isCancelled: false
                })
            }

            const store = await createTestStore()
            store.pushPath("/admin/databases");

            const app = mount(store.getAppContainer())
            await store.waitForActions([FETCH_DATABASES])

            const wrapper = app.find(DatabaseListApp)
            const dbCount = wrapper.find('tr').length

            const deleteButton = wrapper.find('.Button.Button--danger').first()

            deleteButton.simulate('click')

            const deleteModal = wrapper.find('.test-modal')
            deleteModal.find('.Form-input').simulate('change', { target: { value: "DELETE" }})
            deleteModal.find('.Button.Button--danger').simulate('click')

            // test that the modal is gone
            expect(wrapper.find('.test-modal').length).toEqual(0)

            // we should now have a disabled db row during delete
            expect(wrapper.find('tr.disabled').length).toEqual(1)

            // db delete fails
            await store.waitForActions([DELETE_DATABASE_FAILED])

            // there should be no disabled db rows now
            expect(wrapper.find('tr.disabled').length).toEqual(0)

            // the db count should be same as before
            expect(wrapper.find('tr').length).toEqual(dbCount)

            expect(wrapper.find(FormMessage).text()).toBe(SERVER_ERROR_MESSAGE);
        })
    })

    describe('editing', () => {
        const newName = "Ex-Sample Data Set";

        it('should be able to edit database name', async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases");

            const app = mount(store.getAppContainer())
            await store.waitForActions([FETCH_DATABASES])

            const wrapper = app.find(DatabaseListApp)
            const sampleDatasetEditLink = wrapper.find('a[children="Sample Dataset"]').first()
            clickRouterLink(sampleDatasetEditLink);

            expect(store.getPath()).toEqual("/admin/databases/1")
            await store.waitForActions([INITIALIZE_DATABASE]);

            const dbDetailsForm = app.find(DatabaseEditApp);
            expect(dbDetailsForm.length).toBe(1);

            const nameField = dbDetailsForm.find(`input[name="name"]`);
            expect(nameField.props().value).toEqual("Sample Dataset")

            nameField.simulate('change', { target: { value: newName } });

            const saveButton = dbDetailsForm.find('button[children="Save"]')
            saveButton.simulate("submit");

            await store.waitForActions([UPDATE_DATABASE_STARTED]);
            expect(saveButton.text()).toBe("Saving...");
            expect(saveButton.props().disabled).toBe(true);

            await store.waitForActions([UPDATE_DATABASE]);
            expect(saveButton.props().disabled).toBe(undefined);
            expect(dbDetailsForm.find(FormMessage).text()).toEqual("Successfully saved!");
        })

        it('should show the updated database name', async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");

            const app = mount(store.getAppContainer())
            await store.waitForActions([INITIALIZE_DATABASE]);

            const dbDetailsForm = app.find(DatabaseEditApp);
            expect(dbDetailsForm.length).toBe(1);

            const nameField = dbDetailsForm.find(`input[name="name"]`);
            expect(nameField.props().value).toEqual(newName)
        });

        it('should show an error if saving fails', async () => {
            const store = await createTestStore()
            store.pushPath("/admin/databases/1");

            const app = mount(store.getAppContainer())
            await store.waitForActions([INITIALIZE_DATABASE]);

            const dbDetailsForm = app.find(DatabaseEditApp);
            expect(dbDetailsForm.length).toBe(1);

            const tooLongName = "too long name ".repeat(100);
            const nameField = dbDetailsForm.find(`input[name="name"]`);
            nameField.simulate('change', { target: { value: tooLongName } });

            const saveButton = dbDetailsForm.find('button[children="Save"]')
            saveButton.simulate("submit");

            await store.waitForActions([UPDATE_DATABASE_STARTED]);
            expect(saveButton.text()).toBe("Saving...");
            expect(saveButton.props().disabled).toBe(true);

            await store.waitForActions([UPDATE_DATABASE_FAILED]);
            expect(saveButton.props().disabled).toBe(undefined);
            expect(dbDetailsForm.find(".Form-message.text-error").length).toBe(1);
        });

        afterAll(async () => {
            const store = await createTestStore()
            store.dispatch(initializeDatabase(1));
            await store.waitForActions([INITIALIZE_DATABASE])
            const sampleDatasetDb = getEditingDatabase(store.getState())

            await MetabaseApi.db_update({
                ...sampleDatasetDb,
                name: "Sample Dataset"
            });
        });
    })
})
