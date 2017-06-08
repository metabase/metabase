import Dimension from "./Dimension";

import {
    metadata,
    MAIN_FLOAT_FIELD_ID,
    MAIN_CATEGORY_FIELD_ID,
    MAIN_DATE_FIELD_ID,
    MAIN_FK_FIELD_ID,
    FOREIGN_TEXT_FIELD_ID
} from "metabase/__support__/fixtures";

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
            expect(d1.isEqual(d2)).toEqual(true);
            expect(d1.isEqual(["field-id", 1])).toEqual(true);
            expect(d1.isEqual(1)).toEqual(true);
        });
        it("should return false for different type clauses", () => {
            const d1 = Dimension.parseMBQL(["fk->", 1, 2]);
            const d2 = Dimension.parseMBQL(["field-id", 1]);
            expect(d1.isEqual(d2)).toEqual(false);
        });
        it("should return false for same type clauses with different arguments", () => {
            const d1 = Dimension.parseMBQL(["fk->", 1, 2]);
            const d2 = Dimension.parseMBQL(["fk->", 1, 3]);
            expect(d1.isEqual(d2)).toEqual(false);
        });
    });
});

describe("FieldIdDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["field-id", MAIN_FLOAT_FIELD_ID],
        metadata
    );
    describe("mbql", () => {
        it('should return a "field-id" clause', () => {
            expect(dimension.mbql()).toEqual(["field-id", MAIN_FLOAT_FIELD_ID]);
        });
    });
    describe("displayName", () => {
        it("should return the field name", () => {
            expect(dimension.displayName()).toEqual("Mock Float Field");
        });
    });
    describe("subDisplayName", () => {
        it("should return 'Continuous (no binning)' for numeric fields", () => {
            expect(dimension.subDisplayName()).toEqual(
                "Continuous (no binning)"
            );
        });
        it("should return 'Default' for non-numeric fields", () => {
            expect(
                Dimension.parseMBQL(
                    ["field-id", MAIN_CATEGORY_FIELD_ID],
                    metadata
                ).subDisplayName()
            ).toEqual("Default");
        });
    });
    describe("subTriggerDisplayName", () => {
        it("should not have a value", () => {
            expect(dimension.subTriggerDisplayName()).toBeFalsy();
        });
    });
});

describe("FKDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["fk->", MAIN_FK_FIELD_ID, FOREIGN_TEXT_FIELD_ID],
        metadata
    );
    describe("mbql", () => {
        it('should return a "fk->" clause', () => {
            expect(dimension.mbql()).toEqual([
                "fk->",
                MAIN_FK_FIELD_ID,
                FOREIGN_TEXT_FIELD_ID
            ]);
        });
    });
    describe("displayName", () => {
        it("should return the field name", () => {
            expect(dimension.displayName()).toEqual("Mock Foreign Text Field");
        });
    });
    describe("subDisplayName", () => {
        it("should return the field name", () => {
            expect(dimension.subDisplayName()).toEqual(
                "Mock Foreign Text Field"
            );
        });
    });
    describe("subTriggerDisplayName", () => {
        it("should not have a value", () => {
            expect(dimension.subTriggerDisplayName()).toBeFalsy();
        });
    });
});

describe("DatetimeFieldDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["datetime-field", MAIN_DATE_FIELD_ID, "month"],
        metadata
    );
    describe("mbql", () => {
        it('should return a "datetime-field" clause', () => {
            expect(dimension.mbql()).toEqual([
                "datetime-field",
                ["field-id", MAIN_DATE_FIELD_ID],
                "month"
            ]);
        });
    });
    describe("displayName", () => {
        it("should return the field name", () => {
            expect(dimension.displayName()).toEqual("Mock Date Field");
        });
    });
    describe("subDisplayName", () => {
        it("should return 'Month'", () => {
            expect(dimension.subDisplayName()).toEqual("Month");
        });
    });
    describe("subTriggerDisplayName", () => {
        it("should return 'by month'", () => {
            expect(dimension.subTriggerDisplayName()).toEqual("by month");
        });
    });
});

describe("BinningStrategyDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["binning-strategy", MAIN_FLOAT_FIELD_ID, "default", 10],
        metadata
    );
    describe("mbql", () => {
        it('should return a "binning-strategy" clause', () => {
            expect(dimension.mbql()).toEqual([
                "binning-strategy",
                ["field-id", MAIN_FLOAT_FIELD_ID],
                "default",
                10
            ]);
        });
    });
    describe("displayName", () => {
        it("should return the field name", () => {
            expect(dimension.displayName()).toEqual("Mock Float Field");
        });
    });
    describe("subDisplayName", () => {
        it("should return 'Quantized into 10 bins'", () => {
            expect(dimension.subDisplayName()).toEqual(
                "Quantized into 10 bins"
            );
        });
    });
    describe("subTriggerDisplayName", () => {
        it("should return '10 bins'", () => {
            expect(dimension.subTriggerDisplayName()).toEqual("10 bins");
        });
    });
});

describe("ExpressionDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["expression", "Hello World"],
        metadata
    );
    describe("mbql", () => {
        it('should return a "expression" clause', () => {
            expect(dimension.mbql()).toEqual(["expression", "Hello World"]);
        });
    });
    describe("displayName", () => {
        it("should return the expression name", () => {
            expect(dimension.displayName()).toEqual("Hello World");
        });
    });
});
