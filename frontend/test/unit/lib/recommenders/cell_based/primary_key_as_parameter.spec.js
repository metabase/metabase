import * as Query from "metabase/meta/Query";
import { createQuery } from "metabase/lib/query";
import {suggestDashboardParameterizedByID, suggestCardParameterizedByID} from "metabase/lib/recommenders/cell_based/primary_key_as_parameter"

describe("Cell Based Recommender -- Primary Key Parameterized", () => {
    describe("Cards Parameterized by ID recommender", () => {
        it("Should return a dashboard parametereized by the PK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let result = suggestDashboardParameterizedByID(query, resultRow, columnDefinitions, 0)
            expect(result).toEqual([{target : {name: 'Fake Dashboard', id: 1}, 
                                     source: suggestDashboardParameterizedByID.verbose_name, 
                                     recommendation: "See Dashboard Fake Dashboard limited by id",
                                     url: "/dashboard/1",
                                     score: 1}]);
        });
    });
    describe("Dashboards Parameterized by ID recommender", () => {
        it("Should return a card parametereized by the PK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let result = suggestCardParameterizedByID(query, resultRow, columnDefinitions, 0)
            expect(result).toEqual([{target : {name: 'Fake Card', id: 1}, 
                                     source: suggestCardParameterizedByID.verbose_name, 
                                     recommendation: "See Card Fake card limited by id",
                                     url: "/card/1",
                                     score: 1}]);
        });
    });

});
