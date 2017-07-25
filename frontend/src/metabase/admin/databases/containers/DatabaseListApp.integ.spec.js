import {
    login,
    createTestStore, clickRouterLink,
} from "metabase/__support__/integrated_tests";

import { mount } from "enzyme";
import {
    FETCH_DATABASES, DELETE_DATABASE, SAVE_DATABASE, INITIALIZE_DATABASE,
    START_ADD_DATABASE
} from "metabase/admin/databases/database"
import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp";

import { MetabaseApi } from 'metabase/services'
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp";

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
        it('should not block adding a new db', async () => {
            MetabaseApi.db_create = async (db) => { return {...db, id: 10}; };

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

            expect(dbDetailsForm.find('button[children="Save"]').props().disabled).toBe(false)
            dbDetailsForm.find('button[children="Save"]').simulate("submit");

            await store.waitForActions([START_ADD_DATABASE])

            expect(store.getPath()).toEqual("/admin/databases")

            const listAppAfterAdd = app.find(DatabaseListApp)
            expect(listAppAfterAdd.length).toBe(1);

            // we should now have a disabled db row during the add
            expect(listAppAfterAdd.find('tr.disabled').length).toEqual(1)

            // wait until db creation finishes
            await store.waitForActions([SAVE_DATABASE])

            // there should be no disabled db rows now
            expect(listAppAfterAdd.find('tr.disabled').length).toEqual(0)
        })
    })

    describe('deletes', () => {
        it('should not block deletes', async () => {
            // mock the db_delete method call to simulate a longer running delete
            MetabaseApi.db_delete = () => {}

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

            // we should now have one less database in the list
            expect(wrapper.find('tr').length).toEqual(dbCount - 1)
        })
    })
})
