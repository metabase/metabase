import { compile, suggest } from "metabase/lib/expressions/parser";
import _ from "underscore";

const mockFields = [
    {id: 1, display_name: "A"},
    {id: 2, display_name: "B"},
    {id: 3, display_name: "C"},
    {id: 10, display_name: "Toucan Sam"}
];

describe("lib/expressions/parser", () => {
    describe("compile()", () => {
        it("should return empty array for null or empty string", () => {
            expect(compile()).toEqual([]);
            expect(compile(null)).toEqual([]);
            expect(compile("")).toEqual([]);
        });

        it("can parse simple expressions", () => {
            expect(compile("A", { fields: mockFields })).toEqual(['field-id', 1]);
            expect(compile("1", { fields: mockFields })).toEqual(1);
            expect(compile("1.1", { fields: mockFields })).toEqual(1.1);
        });

        it("can parse single operator math", () => {
            expect(compile("A-B", { fields: mockFields })).toEqual(["-", ['field-id', 1], ['field-id', 2]]);
            expect(compile("A - B", { fields: mockFields })).toEqual(["-", ['field-id', 1], ['field-id', 2]]);
            expect(compile("1 - B", { fields: mockFields })).toEqual(["-", 1, ['field-id', 2]]);
            expect(compile("1 - 2", { fields: mockFields })).toEqual(["-", 1, 2]);
        });

        it("can handle operator precedence", () => {
            expect(compile("1 + 2 * 3", { fields: mockFields })).toEqual(["+", 1, ["*", 2, 3]]);
            expect(compile("1 * 2 + 3", { fields: mockFields })).toEqual(["+", ["*", 1, 2], 3]);
        });

        // quoted field name w/ a space in it
        it("can parse a field with quotes and spaces", () => {
            expect(compile("\"Toucan Sam\" + B", { fields: mockFields })).toEqual(["+", ['field-id', 10], ['field-id', 2]]);
        });

        // parentheses / nested parens
        it("can parse expressions with parentheses", () => {
            expect(compile("(1 + 2) * 3", { fields: mockFields })).toEqual(["*", ["+", 1, 2], 3]);
            expect(compile("1 * (2 + 3)", { fields: mockFields })).toEqual(["*", 1, ["+", 2, 3]]);
            expect(compile("\"Toucan Sam\" + (A * (B / C))", { fields: mockFields })).toEqual(
                ["+", ['field-id', 10], ["*", [ 'field-id', 1 ], ["/", [ 'field-id', 2 ], [ 'field-id', 3 ]]]]
            );
        });

        it("can parse aggregation with no arguments", () => {
            expect(compile("Count()", { fields: mockFields })).toEqual(["count"]);
        });

        it("can parse aggregation with argument", () => {
            expect(compile("Sum(A)", { fields: mockFields })).toEqual(["sum", ["field-id", 1]]);
        });

        it("can parse complex aggregation", () => {
            expect(compile("1 - Sum(A * 2) / Count()", { fields: mockFields })).toEqual(["-", 1, ["/", ["sum", ["*", ["field-id", 1], 2]], ["count"]]]);
        });

        it("should throw exception on invalid input", () => {
            expect(() => compile("1 + ", { fields: mockFields })).toThrow();
        });

        // fks
        // multiple tables with the same field name resolution
    });

    describe("suggest()", () => {
        it("should suggest things after an operator", () => {
            expect(cleanSuggestions(suggest("1 + ", { fields: mockFields.slice(-2) }))).toEqual([
                { type: 'aggregation', text: 'Count(' },
                { type: 'aggregation', text: 'Sum(' },
                { type: 'field',       text: '"Toucan Sam"' },
                { type: 'field',       text: 'C' },
                { type: 'other',       text: '(' },
            ]);
        })
        it("should suggest partial matches", () => {
            expect(cleanSuggestions(suggest("1 + C", { fields: mockFields.slice(-2) }))).toEqual([
                { type: 'aggregation', text: 'Count(' },
                { type: 'field',       text: 'C' }
            ]);
        })
    })
});

function cleanSuggestions(suggestions) {
    return _.chain(suggestions).map(s => _.pick(s, "type", "text")).sortBy("text").sortBy("type").value();
}
