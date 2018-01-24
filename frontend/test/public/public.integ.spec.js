import { mount } from 'enzyme'

import {
    createDashboard,
    createTestStore,
    useSharedAdminLogin
} from "__support__/integrated_tests";

import { FETCH_DASHBOARD } from "metabase/dashboard/dashboard";

import * as Urls from "metabase/lib/urls";

import { DashboardApi, SettingsApi } from "metabase/services";

describe('public pages', () => {
    beforeAll(async () => {
        // needed to create the public dash
        useSharedAdminLogin()
    })

    describe('public dashboards', () => {
        let dashboard, store, publicDash

        beforeAll(async () => {
            store = await createTestStore()

            // enable public sharing
            await SettingsApi.put({ key: 'enable-public-sharing', value: true })

            // create a dashboard
            dashboard = await createDashboard({
                name: 'Test public dash',
                description: 'A dashboard for testing public things'
            })

            // create the public link for that dashboard
            publicDash = await DashboardApi.createPublicLink({ id: dashboard.id })

        })

        it('should be possible to view a public dashboard', async () => {
            store.pushPath(Urls.publicDashboard(publicDash.uuid));

            const app = store.mountApp();

            await store.waitForActions([FETCH_DASHBOARD])

            const headerText = app.find('.EmbedFrame-header .h4').text()

            expect(headerText).toEqual('Test public dash')
        })

        afterAll(async () => {
            // archive the dash so we don't impact other tests
            await DashboardApi.update({
                id: dashboard.id,
                archived: true
            })
            // do some cleanup so that we don't impact other tests
            await SettingsApi.put({ key: 'enable-public-sharing', value: false })
        })
    })

})
