import Dimension from "./Dimension";

import {
    metadata,
    ORDERS_TOTAL_FIELD_ID,
    PRODUCT_CATEGORY_FIELD_ID,
    ORDERS_CREATED_DATE_FIELD_ID,
    ORDERS_PRODUCT_FK_FIELD_ID,
    PRODUCT_TILE_FIELD_ID
} from "metabase/__support__/sample_dataset_fixture";

describe("Dimension", () => {
    describe("STATIC METHODS", () => {
        describe("parseMBQL(mbql metadata)", () => {
            it("parses and format MBQL correctly", () => {
                expect(Dimension.parseMBQL(1, metadata).mbql()).toEqual([
                    "field-id",
                    1
                ]);
                expect(
                    Dimension.parseMBQL(["field-id", 1], metadata).mbql()
                ).toEqual(["field-id", 1]);
                expect(
                    Dimension.parseMBQL(["fk->", 1, 2], metadata).mbql()
                ).toEqual(["fk->", 1, 2]);
                expect(
                    Dimension.parseMBQL(
                        ["datetime-field", 1, "month"],
                        metadata
                    ).mbql()
                ).toEqual(["datetime-field", ["field-id", 1], "month"]);
                expect(
                    Dimension.parseMBQL(
                        ["datetime-field", ["field-id", 1], "month"],
                        metadata
                    ).mbql()
                ).toEqual(["datetime-field", ["field-id", 1], "month"]);
                expect(
                    Dimension.parseMBQL(
                        ["datetime-field", ["fk->", 1, 2], "month"],
                        metadata
                    ).mbql()
                ).toEqual(["datetime-field", ["fk->", 1, 2], "month"]);
            });
        });

        describe("isEqual(other)", () => {
            it("returns true for equivalent field-ids", () => {
                const d1 = Dimension.parseMBQL(1, metadata);
                const d2 = Dimension.parseMBQL(["field-id", 1], metadata);
                expect(d1.isEqual(d2)).toEqual(true);
                expect(d1.isEqual(["field-id", 1])).toEqual(true);
                expect(d1.isEqual(1)).toEqual(true);
            });
            it("returns false for different type clauses", () => {
                const d1 = Dimension.parseMBQL(["fk->", 1, 2], metadata);
                const d2 = Dimension.parseMBQL(["field-id", 1], metadata);
                expect(d1.isEqual(d2)).toEqual(false);
            });
            it("returns false for same type clauses with different arguments", () => {
                const d1 = Dimension.parseMBQL(["fk->", 1, 2], metadata);
                const d2 = Dimension.parseMBQL(["fk->", 1, 3], metadata);
                expect(d1.isEqual(d2)).toEqual(false);
            });
        });
    });

    describe("INSTANCE METHODS", () => {
        describe("dimensions()", () => {
            it("returns `dimension_options` of the underlying field if available", () => {
                pending();
            });
            it("returns sub-dimensions for matching dimension if no `dimension_options`", () => {
                // just a single scenario should be sufficient here as we will test
                // `static dimensions()` individually for each dimension
                pending();
            });
        });

        describe("isSameBaseDimension(other)", () => {
            it("returns true if the base dimensions are same", () => {
                pending();
            });
            it("returns false if the base dimensions don't match", () => {
                pending();
            });
        });
    });

    describe("INSTANCE METHODS", () => {
        describe("dimensions()", () => {
            it("returns `default_dimension_option` of the underlying field if available", () => {
                pending();
            });
            it("returns default dimension for matching dimension if no `default_dimension_option`", () => {
                // just a single scenario should be sufficient here as we will test
                // `static defaultDimension()` individually for each dimension
                pending();
            });
        });
    });
});

describe("FieldIDDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["field-id", ORDERS_TOTAL_FIELD_ID],
        metadata
    );

    describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
            it('returns a "field-id" clause', () => {
                expect(dimension.mbql()).toEqual([
                    "field-id",
                    ORDERS_TOTAL_FIELD_ID
                ]);
            });
        });
        describe("displayName()", () => {
            it("returns the field name", () => {
                expect(dimension.displayName()).toEqual("Total");
            });
        });
        describe("subDisplayName()", () => {
            it("returns 'Continuous (no binning)' for numeric fields", () => {
                expect(dimension.subDisplayName()).toEqual(
                    "Continuous (no binning)"
                );
            });
            it("returns 'Default' for non-numeric fields", () => {
                expect(
                    Dimension.parseMBQL(
                        ["field-id", PRODUCT_CATEGORY_FIELD_ID],
                        metadata
                    ).subDisplayName()
                ).toEqual("Default");
            });
        });
        describe("subTriggerDisplayName()", () => {
            it("does not have a value", () => {
                expect(dimension.subTriggerDisplayName()).toBeFalsy();
            });
        });
    });
});

describe("FKDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_TILE_FIELD_ID],
        metadata
    );

    describe("STATIC METHODS", () => {
        describe("dimensions(parentDimension)", () => {
            it("should return array of FK dimensions for foreign key field dimension", () => {
                pending();
                // Something like this:
                // fieldsInProductsTable = metadata.tables[1].fields.length;
                // expect(FKDimension.dimensions(fkFieldIdDimension).length).toEqual(fieldsInProductsTable);
            });
            it("should return empty array for non-FK field dimension", () => {
                pending();
            });
        });
    });

    describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
            it('returns a "fk->" clause', () => {
                expect(dimension.mbql()).toEqual([
                    "fk->",
                    ORDERS_PRODUCT_FK_FIELD_ID,
                    PRODUCT_TILE_FIELD_ID
                ]);
            });
        });
        describe("displayName()", () => {
            it("returns the field name", () => {
                expect(dimension.displayName()).toEqual("Title");
            });
        });
        describe("subDisplayName()", () => {
            it("returns the field name", () => {
                expect(dimension.subDisplayName()).toEqual("Title");
            });
        });
        describe("subTriggerDisplayName()", () => {
            it("does not have a value", () => {
                expect(dimension.subTriggerDisplayName()).toBeFalsy();
            });
        });
    });
});

describe("DatetimeFieldDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["datetime-field", ORDERS_CREATED_DATE_FIELD_ID, "month"],
        metadata
    );

    describe("STATIC METHODS", () => {
        describe("dimensions(parentDimension)", () => {
            it("should return an array with dimensions for each datetime unit", () => {
                pending();
                // Something like this:
                // fieldsInProductsTable = metadata.tables[1].fields.length;
                // expect(FKDimension.dimensions(fkFieldIdDimension).length).toEqual(fieldsInProductsTable);
            });
            it("should return empty array for non-date field dimension", () => {
                pending();
            });
        });
        describe("defaultDimension(parentDimension)", () => {
            it("should return dimension with 'day' datetime unit", () => {
                pending();
            });
            it("should return null for non-date field dimension", () => {
                pending();
            });
        });
    });

    describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
            it('returns a "datetime-field" clause', () => {
                expect(dimension.mbql()).toEqual([
                    "datetime-field",
                    ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
                    "month"
                ]);
            });
        });
        describe("displayName()", () => {
            it("returns the field name", () => {
                expect(dimension.displayName()).toEqual("Created At");
            });
        });
        describe("subDisplayName()", () => {
            it("returns 'Month'", () => {
                expect(dimension.subDisplayName()).toEqual("Month");
            });
        });
        describe("subTriggerDisplayName()", () => {
            it("returns 'by month'", () => {
                expect(dimension.subTriggerDisplayName()).toEqual("by month");
            });
        });
    });
});

describe("BinningStrategyDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["binning-strategy", ORDERS_TOTAL_FIELD_ID, "default", 10],
        metadata
    );

    describe("STATIC METHODS", () => {
        describe("dimensions(parentDimension)", () => {
            it("should return an array of dimensions based on default binning", () => {
                pending();
            });
            it("should return empty array for non-number field dimension", () => {
                pending();
            });
        });
    });

    describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
            it('returns a "binning-strategy" clause', () => {
                expect(dimension.mbql()).toEqual([
                    "binning-strategy",
                    ["field-id", ORDERS_TOTAL_FIELD_ID],
                    "default",
                    10
                ]);
            });
        });
        describe("displayName()", () => {
            it("returns the field name", () => {
                expect(dimension.displayName()).toEqual("Total");
            });
        });
        describe("subDisplayName()", () => {
            it("returns 'Quantized into 10 bins'", () => {
                expect(dimension.subDisplayName()).toEqual(
                    "Quantized into 10 bins"
                );
            });
        });
        describe("subTriggerDisplayName()", () => {
            it("returns '10 bins'", () => {
                expect(dimension.subTriggerDisplayName()).toEqual("10 bins");
            });
        });
    });
});

describe("ExpressionDimension", () => {
    const dimension = Dimension.parseMBQL(
        ["expression", "Hello World"],
        metadata
    );

    describe("STATIC METHODS", () => {
        describe("dimensions(parentDimension)", () => {
            it("should return array of FK dimensions for foreign key field dimension", () => {
                pending();
                // Something like this:
                // fieldsInProductsTable = metadata.tables[1].fields.length;
                // expect(FKDimension.dimensions(fkFieldIdDimension).length).toEqual(fieldsInProductsTable);
            });
            it("should return empty array for non-FK field dimension", () => {
                pending();
            });
        });
    });

    describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
            it('returns an "expression" clause', () => {
                expect(dimension.mbql()).toEqual(["expression", "Hello World"]);
            });
        });
        describe("displayName()", () => {
            it("returns the expression name", () => {
                expect(dimension.displayName()).toEqual("Hello World");
            });
        });
    });
});

describe("AggregationDimension", () => {
    const dimension = Dimension.parseMBQL(["aggregation", 1], metadata);

    describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
            it('returns an "aggregation" clause', () => {
                expect(dimension.mbql()).toEqual(["aggregation", 1]);
            });
        });
    });
});
