import * as Query from "metabase/meta/Query";
import { createQuery } from "metabase/lib/query";
import {suggestObjectDetailView}  from "metabase/lib/recommenders/cell_based/primary_key_object_detail"

describe("Cell based Recommender -- Primary Key Object Details", () => {
    describe("Object details recommender", () => {
        it("should recommend the object details url for a PK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let result = suggestObjectDetailView(query, resultRow, columnDefinitions, 0)
            expect(result).toEqual([{target : {name: 'FIX ME', id: 1}, 
                                     source: suggestObjectDetailView.verbose_name, 
                                     recommendation: "See object detail for 1",
                                     url: "/q/fake_url",
                                     score: 1}]);
        });
        it("should recommend the object details url for a FK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let result = suggestObjectDetailView(query, resultRow, columnDefinitions, 1)
            expect(result).toEqual([{target : {name: 'FIX ME', id: 1}, 
                                     source: suggestObjectDetailView.verbose_name, 
                                     recommendation: "See object detail for 1",
                                     url: "/q/fake_url",
                                     score: 1}]);
        });
        it("should recommend nada for other special_types", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let result = suggestObjectDetailView(query, resultRow, columnDefinitions, 2)
            expect(result).toEqual([]);
        });
    });
});
