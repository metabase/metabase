import _ from "underscore";
import { suggestCountByTime, 
         suggestCountByGeo,
         suggestCountByCategory,
         suggestCountDistinctOfEntityKeys } from "metabase/lib/recommenders/table_based/common_aggregations"

describe("Common Aggregation Recommender", () => {
    describe("Count by time", () => {
        it("Should return count by time", () => {
            let query = {
                source_table: 0,
                aggregation: ["rows"],
                breakout: [],
                filter: [],
                order_by: []
            };
            let results = suggestCountByTime(query)

            expect(results.length).toEqual(1)
            let result = results[0]


            expect(result.target.aggregation).toEqual(['count'])
            expect(result.target.breakout).toEqual(["field-id", 8])

            expect(result.source).toEqual(suggestCountByTime.verboseName);
            expect(result.recommendation).toEqual("See count by timestamp");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);
        });
    });


    describe("Count by geo", () => {
        it("Should return count by city, state + country", () => {
            let query = {
                source_table: 0,
                aggregation: ["rows"],
                breakout: [],
                filter: [],
                order_by: []
            };
            let results = suggestCountByGeo(query)

            expect(results.length).toEqual(3)
            let cityResult = results[0]
            let stateResult = results[1]
            let countryResult = results[2]

            expect(cityResult.target.aggregation).toEqual(['count'])
            expect(cityResult.target.breakout).toEqual(["field-id", 4])

            expect(stateResult.target.aggregation).toEqual(['count'])
            expect(stateResult.target.breakout).toEqual(["field-id", 5])

            expect(countryResult.target.aggregation).toEqual(['count'])
            expect(countryResult.target.breakout).toEqual(["field-id", 6])


            expect(cityResult.source).toEqual(suggestCountByGeo.verboseName);
            expect(cityResult.recommendation).toEqual("See count by city");
            expect(cityResult.url).toEqual("/q/fake_url");
            expect(cityResult.score).toEqual(1);

            expect(stateResult.source).toEqual(suggestCountByGeo.verboseName);
            expect(stateResult.recommendation).toEqual("See count by state");
            expect(stateResult.url).toEqual("/q/fake_url");
            expect(stateResult.score).toEqual(1);

            expect(countryResult.source).toEqual(suggestCountByGeo.verboseName);
            expect(countryResult.recommendation).toEqual("See count by country");
            expect(countryResult.url).toEqual("/q/fake_url");
            expect(countryResult.score).toEqual(1);

        });
    });


    describe("Count by category", () => {
        it("Should return count by category", () => {
            let query = {
                source_table: 0,
                aggregation: ["rows"],
                breakout: [],
                filter: [],
                order_by: []
            };
            let results = suggestCountByCategory(query)

            expect(results.length).toEqual(1)
            let result = results[0]

            expect(result.target.aggregation).toEqual(['count'])
            expect(result.target.breakout).toEqual(["field-id", 7])

            expect(result.source).toEqual(suggestCountByCategory.verboseName);
            expect(result.recommendation).toEqual("See count by status");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);
        });
    });


    describe("Distinct counts", () => {
        it("Should return distinct users and records", () => {
            let query = {
                source_table: 0,
                aggregation: ["rows"],
                breakout: [],
                filter: [],
                order_by: []
            };
            let results = suggestCountDistinctOfEntityKeys(query)

            expect(results.length).toEqual(1)
            let result = results[0]
            expect(result.target.aggregation).toEqual(['distinct', 3])
            
            expect(result.source).toEqual(suggestCountDistinctOfEntityKeys.verboseName);
            expect(result.recommendation).toEqual("See distinct user_id");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);
        });
    });

});
