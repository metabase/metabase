import { timeParameterValueToMBQL } from "./Parameter";

describe("metabase/meta/Parameter", () => {
    describe("timeParameterValueToMBQL", () => {
        it ("should parse past30days", () => {
            expect(timeParameterValueToMBQL("past30days")).toEqual(["time-interval", null, -30, "day"])
        })
        it ("should parse next2years", () => {
            expect(timeParameterValueToMBQL("next2years")).toEqual(["time-interval", null, 2, "year"])
        })
        it ("should parse thisday", () => {
            expect(timeParameterValueToMBQL("thisday")).toEqual(["time-interval", null, "current", "day"])
        })
        it ("should parse ~2017-05-01", () => {
            expect(timeParameterValueToMBQL("~2017-05-01")).toEqual(["<", null, "2017-05-01"])
        })
        it ("should parse 2017-05-01~", () => {
            expect(timeParameterValueToMBQL("2017-05-01~")).toEqual([">", null, "2017-05-01"])
        })
        it ("should parse 2017-05", () => {
            expect(timeParameterValueToMBQL("2017-05")).toEqual(["=", ["datetime-field", null, "month"], "2017-05-01"])
        })
        it ("should parse Q1-2017", () => {
            expect(timeParameterValueToMBQL("Q1-2017")).toEqual(["=", ["datetime-field", null, "quarter"], "2017-01-01"])
        })
        it ("should parse 2017-05-01", () => {
            expect(timeParameterValueToMBQL("2017-05-01")).toEqual(["=", null, "2017-05-01"])
        })
        it ("should parse 2017-05-01~2017-05-02", () => {
            expect(timeParameterValueToMBQL("2017-05-01~2017-05-02")).toEqual(["BETWEEN", null, "2017-05-01", "2017-05-02"])
        })
    })
})
