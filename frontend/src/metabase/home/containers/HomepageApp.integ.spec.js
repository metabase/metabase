import {
    login,
    createTestStore, createSavedQuestion
} from "metabase/__support__/integrated_tests";

import React from 'react';
import { mount } from "enzyme";
import {
    unsavedOrderCountQuestion
} from "metabase/__support__/sample_dataset_fixture";
import { delay } from 'metabase/lib/promise';

import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";
import HomepageApp from "metabase/home/containers/HomepageApp";
import { createMetric, createSegment } from "metabase/admin/datamodel/datamodel";
import { FETCH_ACTIVITY, FETCH_RECENT_VIEWS } from "metabase/home/actions";
import Activity from "metabase/home/components/Activity";
import ActivityItem from "metabase/home/components/ActivityItem";
import ActivityStory from "metabase/home/components/ActivityStory";

describe("HomepageApp", () => {
    beforeAll(async () => {
        await login()

        // Create some entities that will show up in the top of activity feed
        // This test doesn't care if there already are existing items in the feed or not
        const question = await createSavedQuestion(unsavedOrderCountQuestion)

        // Delays are required for having separable creation times for each entity
        await delay(100);

        const segment = await createSegment({
            "id": null,
            "name": "Past 30 days",
            "description": "Past 30 days created at",
            "table_id": 1,
            "definition": {
                "source_table": 1,
                "filter": ["time-interval", ["field-id", 1], -30, "day"]
            }
        });

        await delay(100);

        const metric = await createMetric({
            "id": null,
            "name": "Vendor count",
            "description": "Tells how many vendors we have atm",
            "table_id": 3,
            "definition": {
                "aggregation": [
                    [
                        "distinct",
                        [
                            "field-id",
                            28
                        ]
                    ]
                ],
                "source_table": 3
            },
            "revision_message": "really nothing actually",
            "show_in_getting_started": false
        });

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
            expect(activityStories.at(0).text()).toMatch(/Tells how many vendors we have atm/);

            expect(activityItems.at(1).text()).toMatch(/Past 30 days/);
            expect(activityStories.at(1).text()).toMatch(/Past 30 days created at/);

            // eslint-disable-line react/no-irregular-whitespace
            expect(activityItems.at(2).text()).toMatch(/You saved a question about Orders/);
            expect(activityStories.at(2).text()).toMatch(new RegExp(unsavedOrderCountQuestion.displayName()));


        });
    });

});
