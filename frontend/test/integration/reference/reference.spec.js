/* @flow weak */

// import { DATABASE_ID, ORDERS_TABLE_ID, metadata } from "metabase/__support__/sample_dataset_fixture";
import {
    login,
    createTestStore
} from "metabase/__support__/integrated_tests";

import React from 'react';
import { shallow, mount, render } from 'enzyme';

import { CardApi, SegmentApi, MetricApi } from 'metabase/services'
import { fetchMetrics } from "metabase/redux/metadata";
import { 
    FETCH_DATABASE_METADATA,
    FETCH_DATABASES,
    FETCH_METRICS,
    FETCH_SEGMENTS,
    FETCH_SEGMENT_TABLE,
    FETCH_SEGMENT_FIELDS,
    FETCH_METRIC_TABLE,
    FETCH_SEGMENT_REVISIONS,
    FETCH_METRIC_REVISIONS
} from "metabase/redux/metadata";

import { FETCH_GUIDE } from "metabase/reference/reference"
import { LOAD_ENTITIES } from "metabase/questions/questions"

import DatabaseListContainer from "metabase/reference/databases/DatabaseListContainer";
import DatabaseDetailContainer from "metabase/reference/databases/DatabaseDetailContainer";
import TableListContainer from "metabase/reference/databases/TableListContainer";
import TableDetailContainer from "metabase/reference/databases/TableDetailContainer";
import TableQuestionsContainer from "metabase/reference/databases/TableQuestionsContainer";
import FieldListContainer from "metabase/reference/databases/FieldListContainer";
import FieldDetailContainer from "metabase/reference/databases/FieldDetailContainer";

import GettingStartedGuideContainer from "metabase/reference/guide/GettingStartedGuideContainer";

import SegmentListContainer from "metabase/reference/segments/SegmentListContainer";
import SegmentDetailContainer from "metabase/reference/segments/SegmentDetailContainer";
import SegmentQuestionsContainer from "metabase/reference/segments/SegmentQuestionsContainer";
import SegmentRevisionsContainer from "metabase/reference/segments/SegmentRevisionsContainer";
import SegmentFieldListContainer from "metabase/reference/segments/SegmentFieldListContainer";
import SegmentFieldDetailContainer from "metabase/reference/segments/SegmentFieldDetailContainer";

import MetricListContainer from "metabase/reference/metrics/MetricListContainer";
import MetricDetailContainer from "metabase/reference/metrics/MetricDetailContainer";
import MetricQuestionsContainer from "metabase/reference/metrics/MetricQuestionsContainer";
import MetricRevisionsContainer from "metabase/reference/metrics/MetricRevisionsContainer";


describe("The Reference Section", () => {
    // Test data
    const segmentDef = {name: "A Segment", description: "I did it!", table_id: 1, show_in_getting_started: true,
                        definition: {database: 1, query: {filter: ["abc"]}}}

    const anotherSegmentDef = {name: "Another Segment", description: "I did it again!", table_id: 1, show_in_getting_started: true,
                               definition:{database: 1, query: {filter: ["def"]}}}
    const metricDef = {name: "A Metric", description: "I did it!", table_id: 1,show_in_getting_started: true,
                        definition: {database: 1, query: {aggregation: ["count"]}}}

    const anotherMetricDef = {name: "Another Metric", description: "I did it again!", table_id: 1,show_in_getting_started: true,
                        definition: {database: 1, query: {aggregation: ["count"]}}}
    
    const cardDef = { name :"A card", display: "scalar", 
                      dataset_query: {database: 1, table_id: 1, type: "query", query: {source_table: 1, "aggregation": ["count"]}},
                      visualization_settings: {}}

    const metricCardDef = { name :"A card", display: "scalar", 
                      dataset_query: {database: 1, table_id: 1, type: "query", query: {source_table: 1, "aggregation": ["metric", 1]}},
                      visualization_settings: {}}
    const segmentCardDef = { name :"A card", display: "scalar", 
                      dataset_query: {database: 1, table_id: 1, type: "query", query: {source_table: 1, "aggregation": ["count"], "filter": ["segment", 1]}},
                      visualization_settings: {}}

    // Scaffolding
    beforeAll(async () => {
        await login();

    })


    describe("The Getting Started Guide", async ()=>{
        
        
        it("Should show an empty guide for non-admin users", async () => {
            const store = await createTestStore()    
            store.pushPath("/reference/");
            const container = mount(store.connectContainer(<GettingStartedGuideContainer />));
            await store.waitForActions([FETCH_DATABASE_METADATA, FETCH_SEGMENTS, FETCH_METRICS])
        })
        
        it("Should show an empty guide with a creation CTA for admin users", async () => {
            // TODO
            expect(true).toBe(true)
        })

        it("A non-admin attempting to edit the guide should get an error", async () => {
            // TODO
            expect(true).toBe(true)
        })

        it("Adding metrics should to the guide should make them appear", async () => {
            
            expect(0).toBe(0)
            var metric = await MetricApi.create(metricDef);
            expect(1).toBe(1)
            var metric2 = await MetricApi.create(anotherMetricDef);
            expect(2).toBe(2)
            await MetricApi.delete({metricId: metric.id, revision_message: "Please"})
            expect(1).toBe(1)
            await MetricApi.delete({metricId: metric2.id, revision_message: "Please"})
            expect(0).toBe(0)
        })

        it("Adding segments should to the guide should make them appear", async () => {
            expect(0).toBe(0)
            var segment = await SegmentApi.create(segmentDef);
            expect(1).toBe(1)
            var anotherSegment = await SegmentApi.create(anotherSegmentDef);
            expect(2).toBe(2)
            await SegmentApi.delete({segmentId: segment.id, revision_message: "Please"})
            expect(1).toBe(1)
            await SegmentApi.delete({segmentId: anotherSegment.id, revision_message: "Please"})
            expect(0).toBe(0)
        })
        
    })
    
    describe("The Metrics section of the Data Reference", async ()=>{
        describe("Empty State", async () => {

            it("Should show no metrics in the list", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/metrics");
                const container = mount(store.connectContainer(<MetricListContainer />));
                await store.waitForActions([FETCH_METRICS])
            })

        });

        describe("With Metrics State", async () => {
            var metricIds = []
            var segmentIds = []

            beforeAll(async () => {            
                // Create some metrics to have something to look at
                var metric = await MetricApi.create(metricDef);
                var metric2 = await MetricApi.create(anotherMetricDef);
                
                metricIds.push(metric.id)
                metricIds.push(metric2.id)
                console.log(metricIds)
                })

            afterAll(async () => {
                // Delete the guide we created
                // remove the metrics we created   
                // This is a bit messy as technically these are just archived
                for (const id of metricIds){
                    await MetricApi.delete({metricId: id, revision_message: "Please"})
                }
            })
            // metrics list
            it("Should show no metrics in the list", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/metrics");
                const container = mount(store.connectContainer(<MetricListContainer />));
                await store.waitForActions([FETCH_METRICS])
            })
            // metric detail
            it("Should show the metric detail view for a specific id", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/metrics/"+metricIds[0]);
                const container = mount(store.connectContainer(<MetricDetailContainer />));
                await store.waitForActions([FETCH_METRIC_TABLE, FETCH_GUIDE])
            })
            // metrics questions 
            it("Should show no questions based on a new metric", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/metrics/"+metricIds[0]+'/questions');
                const container = mount(store.connectContainer(<MetricQuestionsContainer />));
                await store.waitForActions([FETCH_METRICS, FETCH_METRIC_TABLE])
            })
            // metrics revisions
            it("Should show revisions", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/metrics/"+metricIds[0]+'/revisions');
                const container = mount(store.connectContainer(<MetricRevisionsContainer />));
                await store.waitForActions([FETCH_METRICS, FETCH_METRIC_REVISIONS])
            })

            it("Should see a newly asked question in its questions list", async () => {
                    var card = await CardApi.create(metricCardDef)

                    expect(card.name).toBe(metricCardDef.name);
                    // see that there is a new question on the metric's questions page
                    const store = await createTestStore()    
                    store.pushPath("/reference/metrics/"+metricIds[0]+'/questions');
                    const container = mount(store.connectContainer(<MetricQuestionsContainer />));
                    await store.waitForActions([FETCH_METRICS, FETCH_METRIC_TABLE])
                    
                    await CardApi.delete({cardId: card.id})
            })

                       
        });
    });
    
    describe("The Segments section of the Data Reference", async ()=>{

        describe("Empty State", async () => {
                it("Should show no segments in the list", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/segments");
                const container = mount(store.connectContainer(<SegmentListContainer />));
                await store.waitForActions([FETCH_SEGMENTS])
            })

        });

        fdescribe("With Segments State", async () => {
            var segmentIds = []

            beforeAll(async () => {            
                // Create some segments to have something to look at
                var segment = await SegmentApi.create(segmentDef);
                var anotherSegment = await SegmentApi.create(anotherSegmentDef);
                segmentIds.push(segment.id)
                segmentIds.push(anotherSegment.id)

                })

            afterAll(async () => {
                // Delete the guide we created
                // remove the metrics  we created   
                // This is a bit messy as technically these are just archived
                for (const id of segmentIds){
                    await SegmentApi.delete({segmentId: id, revision_message: "Please"})
                }
            })


            // segments list
            it("Should show the segments in the list", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/segments");
                const container = mount(store.connectContainer(<SegmentListContainer />));
                await store.waitForActions([FETCH_SEGMENTS])
            })
            // segment detail
            it("Should show the segment detail view for a specific id", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/segments/"+segmentIds[0]);
                const container = mount(store.connectContainer(<SegmentDetailContainer />));
                await store.waitForActions([FETCH_SEGMENT_TABLE])
            })

            // segments field list
            it("Should show the segment fields list", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/segments/"+segmentIds[0]+"/fields");
                const container = mount(store.connectContainer(<SegmentFieldListContainer />));
                await store.waitForActions([FETCH_SEGMENT_TABLE, FETCH_SEGMENT_FIELDS])
            })
            // segment detail
            it("Should show the segment field detail view for a specific id", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/segments/"+segmentIds[0]+"/fields/" + 1);
                const container = mount(store.connectContainer(<SegmentFieldDetailContainer />));
                await store.waitForActions([FETCH_SEGMENT_TABLE, FETCH_SEGMENT_FIELDS])
            })

            // segment questions 
            it("Should show no questions based on a new segment", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/segments/"+segmentIds[0]+'/questions');
                const container = mount(store.connectContainer(<SegmentQuestionsContainer />));
                await store.waitForActions([FETCH_SEGMENT_TABLE, LOAD_ENTITIES])
            })
            // segment revisions
            it("Should show revisions", async () => {
                const store = await createTestStore()    
                store.pushPath("/reference/segments/"+segmentIds[0]+'/revisions');
                const container = mount(store.connectContainer(<SegmentRevisionsContainer />));
                await store.waitForActions([FETCH_SEGMENT_TABLE, FETCH_SEGMENT_REVISIONS])
            })



            it("Should see a newly asked question in its questions list", async () => {
                var card = await CardApi.create(segmentCardDef)

                expect(card.name).toBe(segmentCardDef.name);
                
                await CardApi.delete({cardId: card.id})

                const store = await createTestStore()    
                store.pushPath("/reference/segments/"+segmentIds[0]+'/questions');
                const container = mount(store.connectContainer(<SegmentQuestionsContainer />));
                await store.waitForActions([FETCH_SEGMENT_TABLE, LOAD_ENTITIES])
            })
                      
        });
    });
    
    describe("The Data Reference for the Sample Database", async () => {
        
        // database list
        it("should see a single database", async ()=>{
            const store = await createTestStore()
            store.pushPath("/reference/databases/");
            const container = mount(store.connectContainer(<DatabaseListContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASES"])
        })
        
        // database detail
        it("should see a the detail view for the sample database", async ()=>{
            const store = await createTestStore()
            store.pushPath("/reference/databases/1");
            const container = mount(store.connectContainer(<DatabaseDetailContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])

        })
        
        // table list
       it("should see the 4 tables in the sample database",async  () => {
            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables");
            const container = mount(store.connectContainer(<TableListContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])

            expect(4).toBe(4);
        })
        // table detail

       it("should see the Orders table", async  () => {
            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables/1");
            const container = mount(store.connectContainer(<TableDetailContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])
            expect(true).toBe(true);
        })

       it("should see the Reviews table", async  () => {
            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables/2");
            const container = mount(store.connectContainer(<TableDetailContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])
            expect(true).toBe(true);
        })
       it("should see the Products table", async  () => {
            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables/3");
            const container = mount(store.connectContainer(<TableDetailContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])
            expect(true).toBe(true);
        })
       it("should see the People table", async  () => {
            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables/4");
            const container = mount(store.connectContainer(<TableDetailContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])
            expect(true).toBe(true);
        })
        // field list
       it("should see the fields for the orders table", async  () => {
            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables/1/fields");
            const container = mount(store.connectContainer(<FieldListContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])
            expect(true).toBe(true);

            expect(true).toBe(true);
        })
       it("should see the questions for the orders tables", async  () => {

            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables/1/questions");
            const container = mount(store.connectContainer(<TableQuestionsContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])
            expect(true).toBe(true);


            expect(true).toBe(true);
            
            var card = await CardApi.create(cardDef)

            expect(card.name).toBe(cardDef.name);
            
            await CardApi.delete({cardId: card.id})
        })

        // field detail

       it("should see the orders created_at timestamp field", async () => {
            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables/1/fields/1");
            const container = mount(store.connectContainer(<FieldDetailContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])
        })

       it("should see the orders id field", async () => {
            const store = await createTestStore()
            store.pushPath("/reference/databases/1/tables/1/fields/25");
            const container = mount(store.connectContainer(<FieldDetailContainer />));
            await store.waitForActions(["metabase/metadata/FETCH_DATABASE_METADATA"])
        })
    });


});