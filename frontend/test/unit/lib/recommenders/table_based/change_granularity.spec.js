import _ from "underscore";
import {suggestDifferentTimeGranularity} from "metabase/lib/recommenders/table_based/change_granularity"

describe("Time granulatiry Recommender", () => {
    describe("Suggest other time extracts", () => {
        it("Should return suggest other time extracts if there is a time breakout already", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: ["field-id", 8, "day"],
                filter: [],
                order_by: []
            };
            let results = suggestDifferentTimeGranularity(query)

            expect(results.length).toEqual(5)
            let result = results[0]
            expect(results[0].recommendation).toEqual("See by Hour instead");
            expect(results[1].recommendation).toEqual("See by Week instead");
            expect(results[2].recommendation).toEqual("See by Month instead");
            expect(results[3].recommendation).toEqual("See by Quarter instead");
            expect(results[4].recommendation).toEqual("See by Year instead");


            expect(result.source).toEqual(suggestDifferentTimeGranularity.verboseName);
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);
        });
        it("Should return nothing if there is no time extract already", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [],
                filter: [],
                order_by: []
            };
            let results = suggestDifferentTimeGranularity(query)

            expect(results.length).toEqual(0)
        });
    });

});
