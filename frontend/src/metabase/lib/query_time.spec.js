import { parseFieldBucketing } from "./query_time"

describe("query_time", () => {
    describe("parseFieldBucketing()", () => {
        it("supports the standard DatetimeField format", () => {
            expect(parseFieldBucketing(["datetime-field", ["field-id", 3], "week"])).toBe("week");
            expect(parseFieldBucketing(["datetime-field", ["field-id", 3], "day"])).toBe("day");
        })

        it("supports the legacy DatetimeField format", () => {
            expect(parseFieldBucketing(["datetime-field", ["field-id", 3], "as", "week"])).toBe("week");
            expect(parseFieldBucketing(["datetime-field", ["field-id", 3], "day"])).toBe("day");
        })
        it("returns the default unit for FK reference", () => {
        })
        it("returns the default unit for local field reference", () => {
        })
        it("returns the default unit for other field types", () => {
        })
    })

    describe("parseFieldTargetId()", () => {
        pending();
    })
})