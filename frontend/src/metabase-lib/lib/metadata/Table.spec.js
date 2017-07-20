import Table from "./Table";
import Database from "./Database";

import {
    state,
    ORDERS_TABLE_ID
} from "metabase/__support__/sample_dataset_fixture";

import { getMetadata } from "metabase/selectors/metadata";

describe("Table", () => {
    let metadata, table;
    beforeEach(() => {
        metadata = getMetadata(state);
        table = metadata.tables[ORDERS_TABLE_ID];
    });

    it("should be a table", () => {
        expect(table).toBeInstanceOf(Table);
    });

    it("should have a database", () => {
        expect(table.db).toBeInstanceOf(Database);
    });

    describe("dimensions", () => {
        it("returns dimension fields", () => {
            pending();
            // expect(table.dimensions().length)
        });
    });

    describe("date fields", () => {
        it("should return date fields", () => {
            expect(table.dateFields().length).toEqual(1);
        });
    });
});
