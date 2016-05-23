import * as Card from "metabase/meta/Card";

describe("Card", () => {
    describe("isStructured()", () => {
        it("should return true", () => {
            expect(Card.isStructured({ dataset_query : { type: "query" }})).toEqual(true);
        });
        it("should return false", () => {
            expect(Card.isStructured({ dataset_query : { type: "native" }})).toEqual(false);
        });
    });
    describe("isNative()", () => {
        it("should return true", () => {
            expect(Card.isNative({ dataset_query : { type: "native" }})).toEqual(true);
        });
        it("should return false", () => {
            expect(Card.isNative({ dataset_query : { type: "query" }})).toEqual(false);
        });
    });
});
