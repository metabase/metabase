import {
    login,
    createTestStore, createSavedQuestion, clickRouterLink
} from "__support__/integrated_tests";

import React from 'react';
import { mount } from "enzyme";
import {
    orders_past_30_days_segment,
    unsavedOrderCountQuestion,
    vendor_count_metric
} from "__support__/sample_dataset_fixture";
import { delay } from 'metabase/lib/promise';

import HomepageApp from "metabase/home/containers/HomepageApp";
import { createMetric, createSegment } from "metabase/admin/datamodel/datamodel";
import { FETCH_ACTIVITY } from "metabase/home/actions";
import { QUERY_COMPLETED } from "metabase/query_builder/actions";

import Activity from "metabase/home/components/Activity";
import ActivityItem from "metabase/home/components/ActivityItem";
import ActivityStory from "metabase/home/components/ActivityStory";
import Scalar from "metabase/visualizations/visualizations/Scalar";

describe("HomepageApp", () => {
    beforeAll(async () => {
        await login()

        // Create some entities that will show up in the top of activity feed
        // This test doesn't care if there already are existing items in the feed or not
        // Delays are required for having separable creation times for each entity
        await createSavedQuestion(unsavedOrderCountQuestion)
        await delay(100);
        await createSegment(orders_past_30_days_segment);
        await delay(100);
        await createMetric(vendor_count_metric);
        await delay(100);
    })

    describe("activity feed", async () => {
        it("shows the expected list of activity", async () => {
            const store = await createTestStore()

            store.pushPath("/");
            const homepageApp = mount(store.connectContainer(<HomepageApp />));
            await store.waitForActions([FETCH_ACTIVITY])

            const activityFeed = homepageApp.find(Activity);
            const activityItems = activityFeed.find(ActivityItem);
            const activityStories = activityFeed.find(ActivityStory);

            expect(activityItems.length).toBeGreaterThanOrEqual(3);
            expect(activityStories.length).toBeGreaterThanOrEqual(3);

            expect(activityItems.at(0).text()).toMatch(/Vendor count/);
            expect(activityStories.at(0).text()).toMatch(/Tells how many vendors we have/);

            expect(activityItems.at(1).text()).toMatch(/Past 30 days/);
            expect(activityStories.at(1).text()).toMatch(/Past 30 days created at/);

            // eslint-disable-next-line no-irregular-whitespace
            expect(activityItems.at(2).text()).toMatch(/You saved a question about Orders/);
            expect(activityStories.at(2).text()).toMatch(new RegExp(unsavedOrderCountQuestion.displayName()));


        });
        it("shows successfully open QB for a metric when clicking the metric name", async () => {
            const store = await createTestStore()

            store.pushPath("/");

            // In this test we have to render the whole app in order to get links work properly
            const app = mount(store.getAppContainer())
            await store.waitForActions([FETCH_ACTIVITY])
            const homepageApp = app.find(HomepageApp);

            const activityFeed = homepageApp.find(Activity);
            const metricLink = activityFeed.find(ActivityItem).find('a[children="Vendor count"]').first();
            clickRouterLink(metricLink)
            
            await store.waitForActions([QUERY_COMPLETED]);
            expect(app.find(Scalar).text()).toBe("200");
        })
    });

});
