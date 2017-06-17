/* @flow weak */

// import { DATABASE_ID, ORDERS_TABLE_ID, metadata } from "metabase/__support__/sample_dataset_fixture";
import { login, startServer, stopServer } from "metabase/__support__/integrated_tests";

import React from 'react';
import { shallow, mount, render } from 'enzyme';

import { ReferenceApp } from './containers/ReferenceApp';

import {browserHistory} from "react-router"
import { CardApi, SegmentApi, MetricApi } from 'metabase/services'


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
        await startServer();
        await login();

        // // mount things
        // const app = mount(<ReferenceApp />);
    })

    afterAll(async () => {
        await stopServer();
    })


   it("do stuff", async () => {

        // browserHistory.replace("/");

        expect(true).toBe(true);
    })



    describe("The Getting Started Guide", ()=>{

        it("Should show an empty guide for non-admin users", async () => {expect(true).toBe(true)})
        
        it("Should show an empty guide with a creation CTA for admin users", async () => {expect(true).toBe(true)})

        it("A non-admin attempting to edit the guide should get an error", async () => {expect(true).toBe(true)})
        
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
            // metrics list
            // metric detail
            // metrics questions 
            // metrics revisions

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

            })

        afterAll(async () => {
            // Delete the guide we created
            // remove the metrics we created   
            // This is a bit messy as technically these are just archived
            for (const id of metricIds){
                await MetricApi.delete({metricId: id, revision_message: "Please"})
            }
        })

        it("Should see a newly asked question in its questions list", async () => {
                var card = await CardApi.create(metricCardDef)

                expect(card.name).toBe(metricCardDef.name);
                
                await CardApi.delete({cardId: card.id})
            })

                       
        });
    });
    
    describe("The Segments section of the Data Reference", async ()=>{

        describe("Empty State", async () => {
                        
        });
        // segments list
        // segments detail
        // segments field list
        // segments field detail
        // segments questions
        // segments revisions
        describe("With Segments State", async () => {
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

            it("Should see a newly asked question in its questions list", async () => {
                var card = await CardApi.create(segmentCardDef)

                expect(card.name).toBe(segmentCardDef.name);
                
                await CardApi.delete({cardId: card.id})
            })
                      
        });
    });
    
    describe("The Data Reference for the Sample Database", async () => {
        
        // database list
        it("should see a single database", async ()=>{})
        
        // database detail
        it("should see a the detail view for the sample database", async ()=>{})
        
        // table list
       it("should see the 4 tables in the sample database",async  () => {
            expect(4).toBe(4);
        })
        // table detail

       it("should see the Orders table", async  () => {
            expect(true).toBe(true);
        })

       it("should see the People table", async  () => {
            expect(true).toBe(true);
        })
       it("should see the Products table", async  () => {
            expect(true).toBe(true);
        })
       it("should see the Reviews table", async  () => {
            expect(true).toBe(true);
        })
        // field list
       it("should see the fields for the orders table", async  () => {
            expect(true).toBe(true);
        })
       it("should see the questions for the orders tables", async  () => {

            expect(true).toBe(true);
            
            var card = await CardApi.create(cardDef)

            expect(card.name).toBe(cardDef.name);
            
            await CardApi.delete({cardId: card.id})
        })

        // field detail

       it("should see the orders created_at timestamp field", async () => {
            expect(true).toBe(true);
        })

       it("should see the orders id field", async () => {
            expect(true).toBe(true);
        })
    });


});


    



