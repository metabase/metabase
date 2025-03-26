import expression from "ts-dedent";

import type { Expression } from "metabase-types/api";

import { dataForFormatting, query } from "../__support__/shared";
import { compileExpression } from "../compiler";
import type { StartRule } from "../types";

import { format } from "./formatter";

function setup(printWidth: number, startRule: StartRule = "expression") {
  async function assertFormatted(
    expressions: string | string[],
  ): Promise<void> {
    if (!Array.isArray(expressions)) {
      return assertFormatted([expressions]);
    }
    for (const source of expressions) {
      const options = {
        query,
        startRule,
        stageIndex: -1,
      };

      const res = compileExpression({
        ...options,
        source,
      });

      if (res.error) {
        throw res.error;
      }

      const result = await format(res.expression, {
        ...options,
        printWidth,
      });

      expect(result).toBe(source);
    }
  }
  return { assertFormatted };
}

describe("format", () => {
  describe("printWidth = 25", () => {
    const { assertFormatted } = setup(25);

    it("formats nested arithmetic expressions", async () => {
      await assertFormatted([
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
      await assertFormatted([
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
      await assertFormatted([
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
      const { assertFormatted } = setup(25, "boolean");
      await assertFormatted([
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
