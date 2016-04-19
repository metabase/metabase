/*eslint-env jasmine */

import { parseExpressionString, tokenAtPosition, tokensToExpression } from "metabase/lib/expressions";

const mockFields = [
    {id: 1, display_name: "A"},
    {id: 2, display_name: "B"}
];

const parsedMockFields = {
    "A": { value: 'A', start: 0, end: 1, suggestions: [  ], parsedValue: [ 'field-id', 1 ] },
    "B": { value: 'B', start: 4, end: 5, suggestions: [  ], parsedValue: [ 'field-id', 2 ] }
}

const mathOperators = new Set(['+', '-', '*', '/']);

const parsedMathOperators = {
    "+": { value: '+', start: 2, end: 3, parsedValue: '+' },
    "-": { value: '-', start: 2, end: 3, parsedValue: '-' },
    "*": { value: '*', start: 2, end: 3, parsedValue: '*' },
    "/": { value: '/', start: 2, end: 3, parsedValue: '/' }
}

describe("parseExpressionString", () => {
    it("should return empty array for null or empty string", () => {
        expect(parseExpressionString()).toEqual([]);
        expect(parseExpressionString(null)).toEqual([]);
        expect(parseExpressionString("")).toEqual([]);
    });

    it("can parse single operator math", () => {
        expect(parseExpressionString("A - B", mockFields, mathOperators)).toEqual([parsedMockFields["A"], parsedMathOperators["-"], parsedMockFields["B"]]);
        expect(parseExpressionString("A + B", mockFields, mathOperators)).toEqual([parsedMockFields["A"], parsedMathOperators["+"], parsedMockFields["B"]]);
        expect(parseExpressionString("A * B", mockFields, mathOperators)).toEqual([parsedMockFields["A"], parsedMathOperators["*"], parsedMockFields["B"]]);
        expect(parseExpressionString("A / B", mockFields, mathOperators)).toEqual([parsedMockFields["A"], parsedMathOperators["/"], parsedMockFields["B"]]);
    });

    // field names with spaces
    // fks
    // nested fields
    // multiple tables with the same field name resolution
    // parentheses
    // nested parens
});
