import {
  getClauseDefinition,
  getMBQLName,
} from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

/** A column as the model sees it: `[Name]` and a type the clause arguments use. */
export type CompletionColumn = { name: string; type: string };

export function getColumnType(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return "boolean";
  }
  if (Lib.isDateOrDateTime(column)) {
    return "datetime";
  }
  if (Lib.isNumeric(column)) {
    return "number";
  }
  if (Lib.isStringOrStringLike(column)) {
    return "string";
  }
  return "other";
}

type Frame = { name: string | null; argIndex: number; hasArgText: boolean };

type Scan =
  | { kind: "text"; quote: string }
  | { kind: "column"; partial: string; frames: Frame[] }
  | {
      kind: "code";
      frames: Frame[];
      isAfterValue: boolean;
      /** True when the text before the cursor ends with an operator. */
      isAfterOperator: boolean;
    };

const OPERATOR_WORDS = new Set(["and", "or", "not"]);

/** Find what the cursor is in: text, a column name, or a function argument. */
function scan(prefix: string): Scan {
  const frames: Frame[] = [];
  let isAfterValue = false;
  let isAfterOperator = false;
  let i = 0;
  const markArgText = () => {
    const top = frames[frames.length - 1];
    if (top) {
      top.hasArgText = true;
    }
  };
  while (i < prefix.length) {
    const char = prefix[i];
    if (!/\s/.test(char) && char !== "," && char !== ")") {
      markArgText();
    }
    if (!/\s/.test(char)) {
      isAfterOperator = false;
    }
    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < prefix.length && prefix[j] !== char) {
        j += prefix[j] === "\\" ? 2 : 1;
      }
      if (j >= prefix.length) {
        return { kind: "text", quote: char };
      }
      i = j + 1;
      isAfterValue = true;
    } else if (char === "[") {
      let j = i + 1;
      while (j < prefix.length && prefix[j] !== "]") {
        j += prefix[j] === "\\" ? 2 : 1;
      }
      if (j >= prefix.length) {
        return { kind: "column", partial: prefix.slice(i), frames };
      }
      i = j + 1;
      isAfterValue = true;
    } else if (/[A-Za-z_]/.test(char)) {
      const word = /^[\w.]+/.exec(prefix.slice(i))?.[0] ?? char;
      const after = /^\s*\(/.exec(prefix.slice(i + word.length));
      if (after) {
        frames.push({ name: word, argIndex: 0, hasArgText: false });
        i += word.length + after[0].length;
        isAfterValue = false;
      } else {
        i += word.length;
        isAfterOperator = OPERATOR_WORDS.has(word.toLowerCase());
        isAfterValue = !isAfterOperator;
      }
    } else if (/[\d.]/.test(char)) {
      i += /^[\d.eE]+/.exec(prefix.slice(i))?.[0].length ?? 1;
      isAfterValue = true;
    } else if (char === "(") {
      frames.push({ name: null, argIndex: 0, hasArgText: false });
      i++;
      isAfterValue = false;
    } else if (char === ")") {
      frames.pop();
      i++;
      isAfterValue = true;
    } else if (char === ",") {
      const top = frames[frames.length - 1];
      if (top) {
        top.argIndex++;
        top.hasArgText = false;
      }
      i++;
      isAfterValue = false;
    } else if (/\s/.test(char)) {
      i++;
    } else {
      // An operator.
      i++;
      isAfterValue = false;
      isAfterOperator = true;
    }
  }
  return { kind: "code", frames, isAfterValue, isAfterOperator };
}

function formatSignature(name: string) {
  const clause = getClauseDefinition(getMBQLName(name) ?? "");
  if (clause == null) {
    return null;
  }
  const args = clause.args.map((arg) =>
    arg.optional ? `${arg.name}?` : arg.name,
  );
  if (clause.multiple) {
    args.push("…");
  }
  return { clause, signature: `${clause.displayName}(${args.join(", ")})` };
}

function columnsOfType(columns: CompletionColumn[], type: string) {
  const names = columns
    .filter((column) => type === "expression" || column.type === type)
    .map((column) => column.name);
  return names.length > 8 ? [...names.slice(0, 8), "…"] : names;
}

/**
 * Describe the place of the cursor in plain words, for a small model that
 * cannot work out the syntax by itself.
 */
export function describeCursor(prefix: string, columns: CompletionColumn[]) {
  const result = scan(prefix);
  if (result.kind === "text") {
    return `The cursor is inside a text value. Finish the text and close it with ${result.quote}.`;
  }
  if (result.kind === "column") {
    const partial = result.partial.toLowerCase();
    const matches = columns
      .map((column) => column.name)
      .filter((name) => name.toLowerCase().startsWith(partial));
    return matches.length > 0
      ? `The cursor is inside the column name "${result.partial}". Return the rest of one of these names, without the part before the cursor: ${matches.slice(0, 5).join(", ")}.`
      : `The cursor is inside the column name "${result.partial}", but no column starts like this. Return an empty completion.`;
  }

  const frame = result.frames[result.frames.length - 1];
  const call = frame?.name != null ? formatSignature(frame.name) : null;
  if (call == null) {
    return result.isAfterValue
      ? "The text before the cursor ends with a complete value. Continue with an operator and a value only when it is obvious, otherwise return an empty completion."
      : "The cursor is after an operator or an opening parenthesis. Write the value that comes next.";
  }

  const { clause, signature } = call;
  if (result.isAfterOperator) {
    return `The cursor is after an operator, inside argument ${frame.argIndex + 1} of ${signature}. Write only the value that comes after the operator: a column, a number, or a text in double quotes.`;
  }
  const lines = [describeArgument(clause, signature, frame, columns)];
  if (result.isAfterValue) {
    lines.push(
      "The argument already has a value. Continue it with an operator only when it is obvious, otherwise return an empty completion.",
    );
  } else if (frame.hasArgText) {
    lines.push("Finish the value of this argument.");
  }
  return lines.join("\n");
}

type ClauseDefinition = NonNullable<
  ReturnType<typeof formatSignature>
>["clause"];

function describeArgument(
  clause: ClauseDefinition,
  signature: string,
  frame: Frame,
  columns: CompletionColumn[],
) {
  // `case` and `if` take pairs of a condition and its output, and an optional
  // default output at the end.
  if (clause.name === "case" || clause.name === "if") {
    if (frame.argIndex === 0) {
      return `The cursor is in ${signature}, at the first condition. Write a condition, then ", " and its output, for example: [Total] > 100, "Large".`;
    }
    return frame.argIndex % 2 === 1
      ? `The cursor is in ${signature}, at the output for the condition before it. Write the value to return: a text in double quotes, a number or a column.`
      : `The cursor is in ${signature}, after a condition and its output. Write either the default output (a text in double quotes, a number or a column), or another condition and its output, for example: [Total] > 100, "Medium".`;
  }

  const lastIndex = clause.args.length - 1;
  const arg =
    clause.args[
      clause.multiple ? Math.min(frame.argIndex, lastIndex) : frame.argIndex
    ];
  if (arg == null) {
    return `The cursor is after the last argument of ${signature}. Return an empty completion.`;
  }
  const lines = [
    `The cursor is in argument ${frame.argIndex + 1} of ${signature}: ${arg.name}, of type ${arg.type}.`,
  ];
  const hasChoices = /Choose from/.test(arg.description ?? "");
  if (arg.description) {
    lines.push(`${arg.name}: ${arg.description}`);
  }
  if (hasChoices) {
    lines.push("Write one of the choices in double quotes.");
  } else if (!frame.hasArgText) {
    if (arg.type === "string") {
      lines.push(
        'Write a text in double quotes, for example "abc", or a column of type string.',
      );
    }
    const matching = columnsOfType(columns, arg.type);
    if (matching.length > 0) {
      lines.push(`Columns of type ${arg.type}: ${matching.join(", ")}.`);
    }
  }
  const rest = clause.args
    .slice(frame.argIndex + 1)
    .filter((arg) => !arg.optional);
  if (rest.length > 0) {
    lines.push(
      `After it come the arguments: ${rest.map((arg) => arg.name).join(", ")}. Write them too, separated by ", ".`,
    );
  }
  return lines.join("\n");
}

/**
 * The rest of the column name at the cursor, when the cursor is inside one and
 * a column starts with the typed text. It needs no model.
 */
export function getColumnNameCompletion(
  prefix: string,
  suffix: string,
  columns: CompletionColumn[],
) {
  const result = scan(prefix);
  if (result.kind !== "column") {
    return null;
  }
  const partial = result.partial.toLowerCase();
  const match = columns.find((column) =>
    column.name.toLowerCase().startsWith(partial),
  );
  if (match == null) {
    return null;
  }
  const rest = match.name.slice(result.partial.length);
  return suffix.startsWith("]") ? rest.replace(/]$/, "") : rest;
}

/** True when the text before the cursor ends with a complete value, outside text and column names. */
export function isAfterValue(prefix: string) {
  const result = scan(prefix);
  return result.kind === "code" && result.isAfterValue;
}

/** The column that the text before the cursor compares with `=` or `!=`. */
export function getComparedColumn(prefix: string) {
  return /(\[(?:[^\]\\]|\\.)+\])\s*!?=\s*$/.exec(prefix)?.[1] ?? null;
}

/** True when the cursor is in code, not inside a text or a column name. */
export function isInCode(prefix: string) {
  return scan(prefix).kind === "code";
}
