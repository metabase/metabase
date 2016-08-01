import * as Query from "metabase/meta/Query";
import { createQuery } from "metabase/lib/query";
import {suggestObjectDetailView}  from "metabase/lib/recommenders/row_based/primary_key_object_detail"

describe("Row based Recommender -- Primary Key Object Details", () => {
    describe("Object details recommender", () => {
        it("should recommend the object details url for a PK or FK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let result = suggestObjectDetailView(query, resultRow, columnDefinitions)

            expect(result).toEqual([{target : {name: 'FIX ME', id: 1}, 
                                     source: suggestObjectDetailView.verbose_name, 
                                     recommendation: "See object detail for 1",
                                     url: "/q/fake_url",
                                     score: 1},
                                    {target : {name: 'FIX ME', id: 1}, 
                                     source: suggestObjectDetailView.verbose_name, 
                                     recommendation: "See object detail for 1",
                                     url: "/q/fake_url",
                                     score: 1}]);
        });
    });
});
