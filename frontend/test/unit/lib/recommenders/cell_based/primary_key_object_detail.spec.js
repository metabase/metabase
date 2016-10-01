import Query, { createQuery } from "metabase/lib/query";
import {suggestObjectDetailView}  from "metabase/lib/recommenders/cell_based/primary_key_object_detail"

describe("Cell based Recommender -- Primary Key Object Details", () => {
    describe("Object details recommender", () => {
        it("should recommend the object details url for a PK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [1,1,"John"]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let results = suggestObjectDetailView(query, resultRow, columnDefinitions, 0)

            expect(results.length).toEqual(1)
            let result = results[0]

            expect(result.source).toEqual(suggestObjectDetailView.verboseName);
            expect(result.recommendation).toEqual("See object detail for 1");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);
        });
        it("should recommend the object details url for a FK", () => {
            let query = createQuery("query", 1, 1)
            let resultRow = [1,1,"John"]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let results = suggestObjectDetailView(query, resultRow, columnDefinitions, 1)

            expect(results.length).toEqual(1)
            let result = results[0]

            expect(result.source).toEqual(suggestObjectDetailView.verboseName);
            expect(result.recommendation).toEqual("See object detail for 1");
            expect(result.url).toEqual("/q/fake_url");
            expect(result.score).toEqual(1);

        });
        it("should recommend nada for other special_types", () => {
            
            let query = createQuery("query", 1, 1)
            let resultRow = [1,1,"John"]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let results = suggestObjectDetailView(query, resultRow, columnDefinitions, 2)
            expect(results.length).toEqual(0)
        });
    });
});
