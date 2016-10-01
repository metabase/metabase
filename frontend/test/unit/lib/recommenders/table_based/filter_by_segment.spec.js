import _ from "underscore";
import {suggestTableSegments} from "metabase/lib/recommenders/table_based/filter_by_segment"

describe("Segment filter Recommender", () => {
    describe("Suggest fitlering by segments", () => {
        it("Should return segmenturls", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [1],
                filter: [],
                order_by: [
                    [["aggregation", 0], "ascending"]
                ]
            };
            let results = suggestTableSegments(query)

            expect(results.length).toEqual(1)
            let result = results[0]

            expect(result.source).toEqual(suggestTableSegments.verboseName);
            expect(result.recommendation).toEqual("Filter down to Fake Segment 1");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);
        });
    });

});
