import * as Query from "metabase/meta/Query";
import { createQuery } from "metabase/lib/query";
import {suggestObjectDetailView}  from "metabase/lib/recommenders/row_based/primary_key_object_detail"

describe("Row based Recommender -- Primary Key Object Details", () => {
    describe("Object details recommender", () => {
        it("should recommend the object details url for a PK or FK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let results = suggestObjectDetailView(query, resultRow[0], columnDefinitions)

            expect(results.length).toEqual(2)
            let result = results[0]
            let result2 = results[1]

            expect(result.source).toEqual(suggestObjectDetailView.verboseName);
            expect(result.recommendation).toEqual("See object detail for 1");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);

            expect(result2.source).toEqual(suggestObjectDetailView.verboseName);
            expect(result2.recommendation).toEqual("See object detail for 1");
            expect(result2.url).toEqual("/q/fake_url");
            expect(result2.score).toEqual(1);

        });
    });
});
