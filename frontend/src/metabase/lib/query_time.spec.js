import { parseFieldBucketing } from "./query_time"

describe("query_time", () => {
    describe("parseFieldBucketing", () => {
        it("should support the standard DatetimeField format", () => {
            expect(parseFieldBucketing(["datetime-field", ["field-id", 3], "week"])).toBe("week");
            expect(parseFieldBucketing(["datetime-field", ["field-id", 3], "day"])).toBe("day");
        })

        it("should support the legacy DatetimeField format", () => {
            expect(parseFieldBucketing(["datetime-field", ["field-id", 3], "as", "week"])).toBe("week");
            expect(parseFieldBucketing(["datetime-field", ["field-id", 3], "day"])).toBe("day");
        })
    })
})