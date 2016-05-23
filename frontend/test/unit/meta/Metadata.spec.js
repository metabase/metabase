import Metadata from "metabase/meta/metadata/Metadata";

describe("Metadata", () => {
    describe("databases()", () => {
        it("should return the right number of databases", () => {
            const m = new Metadata([{ id: 1 }, { id: 2 }, { id: 3 }])
            expect(m.databases().length).toEqual(3);
        });
    });
});
