import { suggestionsForQuery,
         suggestionsForRow,
         suggestionsForCell }  from "metabase/lib/recommenders/recommenders"

describe("Recommender -- Primary Key Object Details", () => {
    describe("Cell based recommender", () => {
        it("should return suggestions for a cell", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: ["field-id", 8, "day"],
                filter: [],
                order_by: []
            };
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let results = suggestionsForCell(query, resultRow, columnDefinitions, 0)
            // console.log("Cell based suggestions", results['Suggested Object Detail View'])
        });
    });
    describe("Row based recommender", () => {
        it("should return suggestions for a row", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: ["field-id", 8, "day"],
                filter: [],
                order_by: []
            };
            let resultRow = [[1,1,"John"]]
            let columnDefinitions = [{special_type: 'PK', name: 'id'}, {special_type:"FK", name: 'user_id'}, {name: "name"}]
            let results = suggestionsForRow(query, resultRow[0], columnDefinitions)
            // console.log("Row based suggestions", results['Suggested Object Detail View'])
        });
    });
    describe("Table based recommender", () => {
        it("should return suggestions for a table based query", () => {
            let query = {
                source_table: 0,
                aggregation: ["count"],
                breakout: ["field-id", 8, "day"],
                filter: [],
                order_by: []
            };
            let results = suggestionsForQuery(query)
            // console.log("Query based suggestions", results)

        });
    });
});
