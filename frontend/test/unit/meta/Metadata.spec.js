import Metadata from "metabase/meta/metadata/Metadata";

describe("Metadata", () => {
    describe("databases()", () => {
        it("should return the right number of databases", () => {
            const m = new Metadata([{ id: 1 }, { id: 2 }, { id: 3 }])
            expect(m.databases().length).toEqual(3);
        });
    });

    describe("fromEntities()", () => {
        it("should return the right number of databases", () => {
            const m = Metadata.fromEntities({
                databases: { 1: { name: "foo", tables: [1] }, 2: {}, 3: {}},
                tables: { 1: { name: "bar", fields: [1] } },
                fields: { 1: { name: "baz" }}
            });
            expect(m.databases().length).toEqual(3);
            expect(m.database(1).name).toEqual("foo");
            expect(m.table(1).name).toEqual("bar");
            expect(m.field(1).name).toEqual("baz");
            expect(m.databases()[0].tables()[0].fields()[0].name).toEqual("baz");
        });
    });
});
