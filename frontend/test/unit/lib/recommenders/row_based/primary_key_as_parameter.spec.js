import * as Query from "metabase/meta/Query";
import { createQuery } from "metabase/lib/query";
import {suggestDashboardParameterizedByID, suggestCardParameterizedByID} from "metabase/lib/recommenders/row_based/primary_key_as_parameter"

describe("Row Based Recommender -- Primary Key Parameterized", () => {
    describe("Cards Parameterized by ID recommender", () => {
        it("Should return a dashboard parametereized by the PK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let results = suggestDashboardParameterizedByID(query, resultRow[0], columnDefinitions)

            expect(results.length).toEqual(1)
            let result = results[0]

            expect(result.source).toEqual(suggestDashboardParameterizedByID.verboseName);
            expect(result.recommendation).toEqual("See Dashboard Fake Dashboard limited by id");
            expect(result.url).toEqual("/dashboard/1");
            expect(result.score).toEqual(1);

        });
    });
    describe("Dashboards Parameterized by ID recommender", () => {
        it("Should return a card parametereized by the PK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let results = suggestCardParameterizedByID(query, resultRow[0], columnDefinitions)

            expect(results.length).toEqual(1)
            let result = results[0]

            expect(result.source).toEqual(suggestCardParameterizedByID.verboseName);
            expect(result.recommendation).toEqual("See Card Fake Card limited by id");
            expect(result.url).toEqual("/card/1");
            expect(result.score).toEqual(1);


        });
    });

});
