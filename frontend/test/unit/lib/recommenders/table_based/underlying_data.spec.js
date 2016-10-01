import _ from "underscore";
import {suggestUnderlyingData} from "metabase/lib/recommenders/table_based/underlying_data"

describe("Underlying data Recommender", () => {
    describe("Underlying data of a query", () => {
        it("Should return a dashboard parametereized by the PK", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [1],
                filter: [],
                order_by: [
                    [["aggregation", 0], "ascending"]
                ]
            };
            let results = suggestUnderlyingData(query)

            expect(results.length).toEqual(1)
            let result = results[0]

            expect(result.source).toEqual(suggestUnderlyingData.verboseName);
            expect(result.recommendation).toEqual("See underlying data");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);
        });
    });

});
