import Table from "metabase/meta/metadata/Table";

describe("Table", () => {
    describe("fields()", () => {
        it("should return the right number of fields", () => {
            const m = new Table({ fields: [{ id: 1 }, { id: 2 }, { id: 3 }] })
            expect(m.fields().length).toEqual(3);
        });
    });
});
