import _ from "underscore";
import {suggestTableMetrics} from "metabase/lib/recommenders/table_based/metrics"

describe("Metric Recommender", () => {
    describe("Suggest other metrics as aggregations", () => {
        it("Should return metric urls", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: [1],
                filter: [],
                order_by: [
                    [["aggregation", 0], "ascending"]
                ]
            };
            let results = suggestTableMetrics(query)

            expect(results.length).toEqual(1)
            let result = results[0]

            expect(result.source).toEqual(suggestTableMetrics.verboseName);
            expect(result.recommendation).toEqual("See Fake Metric 1");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);
        });
    });

});
