/* eslint-disable jest/expect-expect */

import type { Expression } from "metabase-types/api";

import { dataForFormatting, query } from "../__support__/shared";
import { processSource } from "../process";

import { format } from "./formatter";

function setup(printWidth: number, startRule: string = "expression") {
  async function isFormatted(expressions: string | string[]): Promise<void> {
    if (!Array.isArray(expressions)) {
      return isFormatted([expressions]);
    }
    for (const expr of expressions) {
      const options = {
        query,
        startRule,
        stageIndex: -1,
      };

      const source = dedent(expr);
      const { expression: mbql, compileError } = processSource({
        ...options,
        source,
      });

      if (!mbql || compileError) {
        throw new Error(`Cannot compile expression: ${compileError?.message}`);
      }

      const result = await format(mbql, {
        ...options,
        printWidth,
      });

      expect(result).toBe(source);
    }
  }
  return { isFormatted };
}

describe("format", () => {
  describe("printWidth = 25", () => {
    const { isFormatted } = setup(25);

    it("formats nested arithmetic expressions", async () => {
      await isFormatted([
        expression`
          1 + 2 - 3 + 4 / 5
        `,
        expression`
          1 + 2 - 3 + 4 / (5 - 6)
        `,
        expression`
          111111111 + 22222222 -
            333333333 / 44444444
        `,
        expression`
          111111111 +
            22222222 +
            333333333 / 44444444
        `,
        expression`
          111111111 +
            22222222 +
            333333333 /
              4444444444444
        `,
        expression`
          111111111 + 22222222 -
            333333333 /
              (44444444 + 555555)
        `,
        expression`
          111111111 + 22222222 -
            (333333333 - 4444444)
        `,
        expression`
          1 + 2 + 3 * 4 * 5 + 6
        `,
      ]);
    });

    it("formats function calls", async () => {
      await isFormatted([
        expression`
          concat(
            "http://mysite.com/user/",
            [User ID],
            "/"
          )
        `,
        expression`
          case(
            [Total] > 10,
            "GOOD",
            [Total] < 5,
            "BAD",
            "OK"
          )
        `,
        expression`
          startsWith(
            [Product → Category],
            "A",
            "B"
          )
        `,
        expression`
          startsWith(
            [Product → Category],
            "A",
            "B",
            "case-insensitive"
          )
        `,
      ]);
    });

    it("formats chained function calls", async () => {
      await isFormatted([
        expression`
          concat("a", "b")
          AND concat("c", "d")
          AND concat("e", "f")
          AND concat("g", "h")
        `,
        expression`
          concat("foo", "bar")
          AND concat("bar", "baz")
          AND concat("quu", "qux")
          OR concat("foo", "bar")
          AND concat("bar", "baz")
        `,
        expression`
          concat("foo", "bar")
          AND (
            concat("bar", "baz")
            AND concat(
              "quu",
              "qux"
            )
            OR concat("foo", "bar")
          )
          AND concat("bar", "baz")
        `,
        expression`
          concat(
            [User ID] > 12
            AND [Total] < 10,
            "GOOD",
            "OK",
            111111111 +
              22222222 +
              333333333
          )
        `,
      ]);
    });

    it("formats unary operators", async () => {
      const { isFormatted } = setup(25, "boolean");
      await isFormatted([
        expression`
          NOT [Total] < 10
        `,
        expression`
          NOT [Total] <
            11111111111111
        `,
        expression`
          NOT [Total] <
            22222222222222 +
              33333333333333
        `,
        expression`
          NOT (
            contains(
              [User → Name],
              "John"
            )
            OR [User ID] = 1
          )
        `,
      ]);
    });
  });
});

describe("if printWidth = Infinity, it should return the same results as the single-line formatter", () => {
  describe.each(dataForFormatting)("%s", (_name, cases, opts) => {
    const tests = cases.filter(([, expr]) => expr !== undefined);

    it.each(tests)(
      `should format %s`,
      async (source: string, expression: Expression | undefined) => {
        if (expression === undefined) {
          // unreachable
          return;
        }
        const result = await format(expression, {
          ...opts,
          printWidth: Infinity,
        });

        expect(result).toBe(source);
      },
    );
  });
});

// dedents an expression by assuming the first line is no indented
function dedent(input: string): string {
  const lines = input.split("\n").slice(1);
  const indent = lines[0].match(/^ */)?.[0]?.length;
  if (!indent) {
    return input;
  }
  return lines
    .map(line => line.slice(indent))
    .join("\n")
    .trim();
}

// A simple template tag to mark a string as an expression and dedent it
function expression(strings: TemplateStringsArray) {
  return strings.join("");
}
