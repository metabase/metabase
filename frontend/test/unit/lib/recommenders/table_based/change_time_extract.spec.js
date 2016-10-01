import _ from "underscore";
import {suggestDifferentTimeExtract} from "metabase/lib/recommenders/table_based/change_time_extract"

describe("Time extracts Recommender", () => {
    describe("Suggest other time extracts", () => {
        it("Should return suggest other time extracts if there is a time extract already", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: ["field-id", 8, "day"],
                filter: [],
                order_by: []
            };
            let results = suggestDifferentTimeExtract(query)

            expect(results.length).toEqual(4)
            let result = results[0]
            expect(results[0].recommendation).toEqual("See by Hour of Day instead");
            expect(results[1].recommendation).toEqual("See by Week of Year instead");
            expect(results[2].recommendation).toEqual("See by Month of Year instead");
            expect(results[3].recommendation).toEqual("See by Quarter of Year instead");

            expect(result.source).toEqual(suggestDifferentTimeExtract.verboseName);
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
            let results = suggestDifferentTimeExtract(query)

            expect(results.length).toEqual(0)
        });
    });
});
