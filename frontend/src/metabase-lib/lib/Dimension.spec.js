import Dimension from "./Dimension";

describe("Dimension", () => {
    it("should parse and format MBQL correctly", () => {
        expect(Dimension.parseMBQL(1).mbql()).toEqual(["field-id", 1]);
        expect(Dimension.parseMBQL(["field-id", 1]).mbql()).toEqual([
            "field-id",
            1
        ]);
        expect(Dimension.parseMBQL(["fk->", 1, 2]).mbql()).toEqual([
            "fk->",
            1,
            2
        ]);
        expect(
            Dimension.parseMBQL(["datetime-field", 1, "month"]).mbql()
        ).toEqual(["datetime-field", ["field-id", 1], "month"]);
        expect(
            Dimension.parseMBQL([
                "datetime-field",
                ["field-id", 1],
                "month"
            ]).mbql()
        ).toEqual(["datetime-field", ["field-id", 1], "month"]);
        expect(
            Dimension.parseMBQL([
                "datetime-field",
                ["fk->", 1, 2],
                "month"
            ]).mbql()
        ).toEqual(["datetime-field", ["fk->", 1, 2], "month"]);
    });
    describe("isEqual", () => {
        it("should return true for equivalent field-ids", () => {
            const d1 = Dimension.parseMBQL(1);
            const d2 = Dimension.parseMBQL(["field-id", 1]);
            expect(d1.isEqual(d2)).toBe(true);
            expect(d1.isEqual(["field-id", 1])).toBe(true);
            expect(d1.isEqual(1)).toBe(true);
        });
        it("should return false for different type clauses", () => {
            const d1 = Dimension.parseMBQL(["fk->", 1, 2]);
            const d2 = Dimension.parseMBQL(["field-id", 1]);
            expect(d1.isEqual(d2)).toBe(false);
        });
        it("should return false for same type clauses with different arguments", () => {
            const d1 = Dimension.parseMBQL(["fk->", 1, 2]);
            const d2 = Dimension.parseMBQL(["fk->", 1, 3]);
            expect(d1.isEqual(d2)).toBe(false);
        });
    });
});
