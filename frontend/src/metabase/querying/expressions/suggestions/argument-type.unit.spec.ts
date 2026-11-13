import * as Lib from "metabase-lib";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { clausesForMode } from "../clause";
import { diagnoseAndCompile } from "../diagnostics";
import { formatExpressionParts } from "../formatter";
import { getHelpText } from "../help-text";
import { columnsForExpressionMode } from "../mode";
import { query, stageIndex } from "../test/shared";
import { parser } from "../tokenizer/parser";

import { getExpectedColumnType } from "./argument-type";

// Every feature, so that no function fails for lack of one.
const database = createSampleDatabase({
  features: [
    "advanced-math-expressions",
    "collate",
    "convert-timezone",
    "datetime-diff",
    "distinct-where",
    "expressions",
    "expressions/date",
    "expressions/datetime",
    "expressions/float",
    "expressions/integer",
    "expressions/text",
    "expressions/today",
    "percentile-aggregations",
    "regex",
    "regex/lookaheads-and-lookbehinds",
    "split-part",
    "standard-deviation-aggregations",
    "window-functions/offset",
  ],
});

/** One column of each type the filter tells apart. */
const COLUMN_NAMES = [
  "Product → Title", // text
  "Total", // decimal number
  "Quantity", // whole number
  "Created At", // date
];

/** For the other values of an example: a column of the type they take. */
const COLUMN_FOR_ARG_TYPE: Record<string, string> = {
  string: "Product → Title",
  number: "Total",
  datetime: "Created At",
};

/** The source ranges of the arguments of the outermost call. */
function getArgRanges(source: string) {
  const cursor = parser.parse(source).cursor();
  do {
    if (cursor.name === "CallExpression") {
      const args =
        cursor.node.getChildren("ArgList")?.[0]?.getChildren("Arg") ?? [];
      return args.map((arg) => ({ from: arg.from, to: arg.to }));
    }
  } while (cursor.next());
  return [];
}

function replaceArg(source: string, index: number, text: string) {
  const range = getArgRanges(source)[index];
  return source.slice(0, range.from) + text + source.slice(range.to);
}

/**
 * The example of a function, with its columns swapped for columns of the
 * types their values take, so that only the value under test varies.
 */
async function getBaseSource(name: string) {
  const helpText = getHelpText(name, database);
  if (!helpText || helpText.example.args.length === 0) {
    return null;
  }
  let source = await formatExpressionParts(helpText.example);
  getArgRanges(source).forEach((range, index) => {
    const text = source.slice(range.from, range.to);
    const column = COLUMN_FOR_ARG_TYPE[helpText.args[index]?.type ?? ""];
    if (text.startsWith("[") && column) {
      source = replaceArg(source, index, `[${column}]`);
    }
  });
  return source;
}

describe("getExpectedColumnType", () => {
  // The minimum counts make sure the check doesn't quietly skip everything.
  it.each([
    { expressionMode: "expression", minCheckedCount: 50 },
    { expressionMode: "aggregation", minCheckedCount: 8 },
  ] as const)(
    "offers a column in mode $expressionMode exactly when the library accepts it there",
    async ({ expressionMode, minCheckedCount }) => {
      const availableColumns = columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode,
      });
      const columns = COLUMN_NAMES.map((name) => {
        const column = availableColumns.find(
          (column) =>
            Lib.displayInfo(query, stageIndex, column).longDisplayName === name,
        );
        if (!column) {
          throw new Error(`No column called ${name}`);
        }
        return { name, column };
      });

      const compiles = (source: string) =>
        diagnoseAndCompile({
          source,
          expressionMode,
          query,
          stageIndex,
          database,
          availableColumns,
        }).error == null;

      const mismatches: string[] = [];
      let checkedCount = 0;

      // In a summary, only the functions that summarize: any other function
      // fails there on its own, whatever its columns.
      const clauses = clausesForMode(expressionMode).filter(
        (clause) =>
          expressionMode !== "aggregation" || clause.type === "aggregation",
      );

      for (const clause of clauses) {
        // Skip examples that fail as they are, like ones that use a column
        // this table doesn't have.
        const baseSource = await getBaseSource(clause.name);
        if (baseSource == null || !compiles(baseSource)) {
          continue;
        }

        getArgRanges(baseSource).forEach((range, index) => {
          const expected = getExpectedColumnType(baseSource, range.from + 1);
          if (expected == null) {
            return;
          }
          checkedCount++;

          for (const { name, column } of columns) {
            const source = replaceArg(baseSource, index, `[${name}]`);
            const isOffered = expected.test(column);
            if (isOffered !== compiles(source)) {
              mismatches.push(
                `${source}: ${isOffered ? "offered but fails" : "works but hidden"}`,
              );
            }
          }
        });
      }

      expect(checkedCount).toBeGreaterThanOrEqual(minCheckedCount);
      expect(mismatches).toEqual([]);
    },
  );
});
