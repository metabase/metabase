import * as Query from "metabase/meta/Query";
import {suggestDashboardParameterizedByID, suggestCardParameterizedByID} from "metabase/lib/rrecommenders/cell_based/primary_key_as_parameter"

describe("Recommender -- Primary Key Parameterized", () => {
    describe("Cards Parameterized by ID recommender", () => {
        it("should add a filter when none exists", () => {
            expect(1).toEqual(1);
        });
    });
    describe("Dashboards Parameterized by ID recommender", () => {
        it("should add a filter when none exists", () => {
            expect(1).toEqual(1);
        });
    });

});
