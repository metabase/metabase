import {
    login,
    createTestStore,
} from "metabase/__support__/integrated_tests";

import { mount } from "enzyme";
import { FETCH_DATABASES, DELETE_DATABASE } from "metabase/admin/databases/database"
import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp";
import { delay } from "metabase/lib/promise"

import { MetabaseApi } from 'metabase/services'

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

    describe('deletes', () => {
        it('should not block deletes', async () => {
            // mock the db_delete method call to simulate a longer running delete
            MetabaseApi.db_delete = () => delay(5000)

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
