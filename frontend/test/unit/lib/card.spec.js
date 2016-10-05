import {
    createCard,
    utf8_to_b64,
    b64_to_utf8,
    utf8_to_b64url,
    b64url_to_utf8
} from 'metabase/lib/card';

describe('card', () => {

    describe("createCard", () => {
        it("should return a new card", () => {
            expect(createCard()).toEqual({
                name: null,
                display: "table",
                visualization_settings: {},
                dataset_query: {},
            });
        });

        it("should set the name if supplied", () => {
            expect(createCard("something")).toEqual({
                name: "something",
                display: "table",
                visualization_settings: {},
                dataset_query: {},
            });
        });
    });

    describe('utf8_to_b64', () => {
        it('should encode with non-URL-safe characters', () => {
            expect(utf8_to_b64("  ?").indexOf("/")).toEqual(3);
            expect(utf8_to_b64("  ?")).toEqual("ICA/");
        });
    });

    describe('b64_to_utf8', () => {
        it('should decode corretly', () => {
            expect(b64_to_utf8("ICA/")).toEqual("  ?");
        });
    });

    describe('utf8_to_b64url', () => {
        it('should encode with URL-safe characters', () => {
            expect(utf8_to_b64url("  ?").indexOf("/")).toEqual(-1);
            expect(utf8_to_b64url("  ?")).toEqual("ICA_");
        });
    });

    describe('b64url_to_utf8', () => {
        it('should decode corretly', () => {
            expect(b64url_to_utf8("ICA_")).toEqual("  ?");
        });
    });
});
