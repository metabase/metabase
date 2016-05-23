import _ from "underscore";
import { formatExpression, parseExpressionString, tokenAtPosition, tokensToExpression } from "metabase/lib/expressions";

const mockFields = [
    {id: 1, display_name: "A"},
    {id: 2, display_name: "B"},
    {id: 3, display_name: "C"},
    {id: 10, display_name: "Toucan Sam"}
];

const mathOperators = new Set(['+', '-', '*', '/']);

const parsedMathOperators = {
    "+": { value: '+', start: 2, end: 3, parsedValue: '+' },
    "-": { value: '-', start: 2, end: 3, parsedValue: '-' },
    "*": { value: '*', start: 2, end: 3, parsedValue: '*' },
    "/": { value: '/', start: 2, end: 3, parsedValue: '/' }
}

function stripStartEnd(list) {
    return list.map(i => {
        delete i.start;
        delete i.end;

        if (_.isArray(i.value)) {
            i.value = stripStartEnd(i.value);
        }

        return i;
    });
}


describe("parseExpressionString", () => {
    it("should return empty array for null or empty string", () => {
        expect(parseExpressionString()).toEqual([]);
        expect(parseExpressionString(null)).toEqual([]);
        expect(parseExpressionString("")).toEqual([]);
    });

    // simplest possible expression
    it("can parse single operator math", () => {
        expect(stripStartEnd(parseExpressionString("A - B", mockFields, mathOperators)))
        .toEqual([
            { value: 'A', suggestions: [mockFields[0], mockFields[3]], parsedValue: [ 'field-id', 1 ] },
            { value: '-', parsedValue: '-' },
            { value: 'B', suggestions: [], parsedValue: [ 'field-id', 2 ] }
        ]);
    });

    // quoted field name w/ a space in it
    it("can parse a field with quotes and spaces", () => {
        expect(stripStartEnd(parseExpressionString("\"Toucan Sam\" + B", mockFields, mathOperators)))
        .toEqual([
            { value: 'Toucan Sam', suggestions: [], parsedValue: [ 'field-id', 10 ] },
            { value: '+', parsedValue: '+' },
            { value: 'B', suggestions: [], parsedValue: [ 'field-id', 2 ] }
        ]);
    });

    // parentheses / nested parens
    it("can parse expressions with parentheses", () => {
        expect(stripStartEnd(parseExpressionString("\"Toucan Sam\" + (A * (B / C))", mockFields, mathOperators)))
        .toEqual([
            { value: 'Toucan Sam', suggestions: [], parsedValue: [ 'field-id', 10 ] },
            { value: '+', parsedValue: '+' },
            { value: [{ value: 'A', suggestions: [mockFields[0], mockFields[3]], parsedValue: [ 'field-id', 1 ] },
                      { value: '*', parsedValue: '*' },
                      { value: [{ value: 'B', suggestions: [], parsedValue: [ 'field-id', 2 ] },
                                { value: '/', parsedValue: '/' },
                                { value: 'C', suggestions: [mockFields[2], mockFields[3]], parsedValue: [ 'field-id', 3 ] }],
                        isParent: true}],
              isParent: true }
        ]);
    });

    // fks
    // multiple tables with the same field name resolution
});


describe("formatExpression", () => {
    it("should return empty array for null or empty string", () => {
        expect(parseExpressionString()).toEqual([]);
        expect(parseExpressionString(null)).toEqual([]);
        expect(parseExpressionString("")).toEqual([]);
    });

    it("can format simple expressions", () => {
        expect(formatExpression(["+", ["field-id", 1], ["field-id", 2]], mockFields)).toEqual("A + B");
    });

    it("can format expressions with parentheses", () => {
        expect(formatExpression(["+", ["/", ["field-id", 1], ["field-id", 2]], ["field-id", 3]], mockFields)).toEqual("(A / B) + C");
        expect(formatExpression(["+", ["/", ["field-id", 1], ["*", ["field-id", 2], ["field-id", 2]]], ["field-id", 3]], mockFields)).toEqual("(A / (B * B)) + C");
    });

    it("quotes fields with spaces in them", () => {
        expect(formatExpression(["+", ["/", ["field-id", 1], ["field-id", 10]], ["field-id", 3]], mockFields)).toEqual("(A / \"Toucan Sam\") + C");
    });
});
