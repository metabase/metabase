// import * as Query from "metabase/meta/Query";
// import {suggestObjectDetailView}  from "metabase/lib/recommenders/cell_based/primary_key_object_detail"

// describe("Recommender -- Primary Key Object Details", () => {
//     describe("Object details recommender", () => {
//         it("should recommend the object details url for a PK", () => {
//             let query = Query.createQuery("query", 1, 1)
//             let resultRow = [[1,1,"John"]]
//             let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
//             let result = suggestObjectDetailView(query, resultRow, columnDefinitions, 0)
//             expect(result).toEqual([{target : new_query, source: RECOMMENDER_NAME, score: 1}]);
//         });
//         it("should recommend the object details url for a FK", () => {
//             let query = Query.createQuery("query", 1, 1)
//             let resultRow = [[1,1,"John"]]
//             let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
//             let result = suggestObjectDetailView(query, resultRow, columnDefinitions, 1)
//             expect(result).toEqual([{target : new_query, source: RECOMMENDER_NAME, score: 1}]);
//         });
//         it("should recommend nada for other special_types", () => {
//             let query = Query.createQuery("query", 1, 1)
//             let resultRow = [[1,1,"John"]]
//             let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
//             let result = suggestObjectDetailView(query, resultRow, columnDefinitions, 2)
//             expect(result).toEqual([]);
//         });
//     });
// });
