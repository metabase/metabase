/**
 * A small, self-contained Excel-style formula parser/evaluator for the
 * client-side spreadsheet prototype layered on top of the Table
 * visualization's results grid.
 *
 * Scope (intentionally minimal, see CLAUDE-facing writeup for the full
 * rationale): arithmetic (+ - * / ^), parentheses, cell references (A1),
 * ranges (A1:A10), a handful of aggregate functions, and relative/absolute
 * row references ($ before the row number pins it, matching Excel). A
 * formula is authored against whichever row you were sitting in when you
 * typed it (its "anchor row") and "filled down" to every other row via
 * relative row references, exactly like dragging an Excel formula down a
 * column: type `=A5+A6` in row 5, and row 6 evaluates `=A6+A7`.
 *
 * This module has no React/Metabase dependencies so it can be unit tested
 * and reasoned about on its own.
 */

import { columnLetterToIndex } from "./column-letters";

export class FormulaParseError extends Error {}
export class FormulaEvalError extends Error {}

/** Operators that produce a number from two numbers. The local evaluator
 * handles these; everything below is translated and sent to the database. */
export type ArithmeticOperator = "+" | "-" | "*" | "/" | "^";

/** Comparisons and boolean connectives. These exist so Metabase functions
 * like case/if/between can be written naturally; the local evaluator does
 * not implement them, because any formula containing one is computed by
 * the database instead (see requiresServerEvaluation). */
export type PredicateOperator =
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "AND"
  | "OR";

export type FormulaOperator = ArithmeticOperator | PredicateOperator;

export type FormulaAstNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  /** A column referenced by name, Metabase-style: [Subtotal]. */
  | { type: "columnRef"; name: string }
  | { type: "not"; operand: FormulaAstNode }
  | { type: "cellRef"; col: number; row: number; absoluteRow: boolean }
  | {
      type: "range";
      start: { col: number; row: number; absoluteRow: boolean };
      end: { col: number; row: number; absoluteRow: boolean };
    }
  /** A whole column, written "A", "A:A" or "A:C" — every row of the
   * result, with no row numbers to keep in step as the formula fills
   * down. */
  | { type: "columnRange"; startCol: number; endCol: number }
  | { type: "unaryMinus"; operand: FormulaAstNode }
  | {
      type: "binary";
      op: FormulaOperator;
      left: FormulaAstNode;
      right: FormulaAstNode;
    }
  | { type: "call"; name: string; args: FormulaAstNode[] };

type TokenType =
  | "number"
  | "string"
  | "cellRef"
  | "columnRef"
  | "ident"
  | "+"
  | "-"
  | "*"
  | "/"
  | "^"
  | "("
  | ")"
  | ","
  | ":"
  | "compare"
  | "eof";

interface Token {
  type: TokenType;
  text: string;
}

const CELL_REF_RE = /^\$?[A-Za-z]+\$?[0-9]+/;
const NUMBER_RE = /^[0-9]+(\.[0-9]+)?/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
/** Metabase's own column syntax, e.g. [Subtotal]. A closing bracket can be
 * escaped as \] so column names containing one still work. */
const COLUMN_REF_RE = /^\[((?:\\.|[^\]\\])*)\]/;
// Two-character comparisons must be tried before the one-character ones,
// or "<=" would tokenize as "<" followed by a stray "=".
const COMPARISON_OPERATORS = ["<=", ">=", "<>", "!=", "=", "<", ">"];

function unescapeColumnName(raw: string): string {
  return raw.replace(/\\(.)/g, "$1");
}

function readStringLiteral(source: string, start: number) {
  const quote = source[start];
  let i = start + 1;
  let value = "";
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\" && i + 1 < source.length) {
      value += source[i + 1];
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { value, length: i - start + 1 };
    }
    value += ch;
    i += 1;
  }
  throw new FormulaParseError("Unclosed text value — add a closing quote");
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const ch = rest[0];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const { value, length } = readStringLiteral(source, i);
      tokens.push({ type: "string", text: value });
      i += length;
      continue;
    }

    const columnMatch = rest.match(COLUMN_REF_RE);
    if (columnMatch) {
      tokens.push({
        type: "columnRef",
        text: unescapeColumnName(columnMatch[1]),
      });
      i += columnMatch[0].length;
      continue;
    }

    const comparison = COMPARISON_OPERATORS.find((op) => rest.startsWith(op));
    if (comparison) {
      // "<>" is the spreadsheet spelling of "not equal"; Metabase writes
      // it "!=", so normalize here and the translator stays simple.
      tokens.push({
        type: "compare",
        text: comparison === "<>" ? "!=" : comparison,
      });
      i += comparison.length;
      continue;
    }

    if ("+-*/^(),:".includes(ch)) {
      // Guarded by the includes() check above: every character in that
      // string is also a TokenType, which the compiler can't see.
      tokens.push({ type: ch as TokenType, text: ch });
      i += 1;
      continue;
    }

    const cellMatch = rest.match(CELL_REF_RE);
    if (cellMatch) {
      tokens.push({ type: "cellRef", text: cellMatch[0] });
      i += cellMatch[0].length;
      continue;
    }

    const numberMatch = rest.match(NUMBER_RE);
    if (numberMatch) {
      tokens.push({ type: "number", text: numberMatch[0] });
      i += numberMatch[0].length;
      continue;
    }

    const identMatch = rest.match(IDENT_RE);
    if (identMatch) {
      tokens.push({ type: "ident", text: identMatch[0] });
      i += identMatch[0].length;
      continue;
    }

    throw new FormulaParseError(`Unexpected character "${ch}" in formula`);
  }
  tokens.push({ type: "eof", text: "" });
  return tokens;
}

function parseCellRefText(text: string) {
  const match = text.match(/^(\$?)([A-Za-z]+)(\$?)([0-9]+)$/);
  if (!match) {
    throw new FormulaParseError(`Invalid cell reference "${text}"`);
  }
  const [, , letters, absoluteRowMarker, digits] = match;
  return {
    col: columnLetterToIndex(letters),
    // Store as a literal 0-based row index; effectiveRow() below turns
    // this into an offset from wherever the formula's anchor row is.
    row: Number.parseInt(digits, 10) - 1,
    absoluteRow: absoluteRowMarker === "$",
  };
}

/**
 * Metabase's only functions written without parentheses. They're the sole
 * reason a bare word isn't always a column, so they're listed here rather
 * than pulling the whole clause catalog into this module.
 */
const ZERO_ARGUMENT_FUNCTIONS = new Set(["NOW", "TODAY"]);

/** Longer than this is a function name, not a column: "ZZZ" is already
 * column 18,277, far past anything a result set will have. */
const MAX_COLUMN_LETTERS = 3;

/** The column index for a bare word, or null if it can't be one. */
function asColumnLetters(word: string): number | null {
  if (!/^[A-Z]+$/.test(word) || word.length > MAX_COLUMN_LETTERS) {
    return null;
  }
  return columnLetterToIndex(word);
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek() {
    return this.tokens[this.pos];
  }

  private next() {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType) {
    const token = this.next();
    if (token.type !== type) {
      throw new FormulaParseError(
        `Expected "${type}" but found "${token.text || "end of formula"}"`,
      );
    }
    return token;
  }

  parse(): FormulaAstNode {
    const node = this.parseExpression();
    this.expect("eof");
    return node;
  }

  /** Lowest precedence, so `A1 > 5 AND B1 < 3` groups the way it reads. */
  private parseExpression(): FormulaAstNode {
    return this.parseOr();
  }

  private isKeyword(word: string): boolean {
    const token = this.peek();
    return token.type === "ident" && token.text.toUpperCase() === word;
  }

  // or := and ('OR' and)*
  private parseOr(): FormulaAstNode {
    let node = this.parseAnd();
    while (this.isKeyword("OR")) {
      this.next();
      node = { type: "binary", op: "OR", left: node, right: this.parseAnd() };
    }
    return node;
  }

  // and := comparison ('AND' comparison)*
  private parseAnd(): FormulaAstNode {
    let node = this.parseComparison();
    while (this.isKeyword("AND")) {
      this.next();
      node = {
        type: "binary",
        op: "AND",
        left: node,
        right: this.parseComparison(),
      };
    }
    return node;
  }

  // comparison := additive (('=' | '!=' | '<' | '<=' | '>' | '>=') additive)?
  // Non-associative, like Metabase's own expression grammar: chaining
  // comparisons ("1 < A1 < 5") means something different in every language
  // that allows it, so it's rejected rather than silently misread.
  private parseComparison(): FormulaAstNode {
    const node = this.parseAdditive();
    if (this.peek().type === "compare") {
      // A "compare" token's text is always one of the operators the
      // tokenizer emits, which is exactly PredicateOperator.
      const op = this.next().text as PredicateOperator;
      return { type: "binary", op, left: node, right: this.parseAdditive() };
    }
    return node;
  }

  // additive := term (('+' | '-') term)*
  private parseAdditive(): FormulaAstNode {
    let node = this.parseTerm();
    while (this.peek().type === "+" || this.peek().type === "-") {
      // Narrowed by the while condition on the line above.
      const op = this.next().type as "+" | "-";
      node = { type: "binary", op, left: node, right: this.parseTerm() };
    }
    return node;
  }

  // term := power (('*' | '/') power)*
  private parseTerm(): FormulaAstNode {
    let node = this.parsePower();
    while (this.peek().type === "*" || this.peek().type === "/") {
      // Narrowed by the while condition on the line above.
      const op = this.next().type as "*" | "/";
      node = { type: "binary", op, left: node, right: this.parsePower() };
    }
    return node;
  }

  // power := unary ('^' power)?  (right-associative)
  private parsePower(): FormulaAstNode {
    const node = this.parseUnary();
    if (this.peek().type === "^") {
      this.next();
      return { type: "binary", op: "^", left: node, right: this.parsePower() };
    }
    return node;
  }

  private parseUnary(): FormulaAstNode {
    if (this.isKeyword("NOT")) {
      this.next();
      return { type: "not", operand: this.parseUnary() };
    }
    if (this.peek().type === "-") {
      this.next();
      return { type: "unaryMinus", operand: this.parseUnary() };
    }
    if (this.peek().type === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaAstNode {
    const token = this.peek();

    if (token.type === "number") {
      this.next();
      return { type: "number", value: Number.parseFloat(token.text) };
    }

    if (token.type === "string") {
      this.next();
      return { type: "string", value: token.text };
    }

    if (token.type === "columnRef") {
      this.next();
      return { type: "columnRef", name: token.text };
    }

    if (token.type === "cellRef") {
      this.next();
      const start = parseCellRefText(token.text);
      if (this.peek().type === ":") {
        this.next();
        const endToken = this.expect("cellRef");
        const end = parseCellRefText(endToken.text);
        return { type: "range", start, end };
      }
      return { type: "cellRef", ...start };
    }

    if (token.type === "(") {
      this.next();
      const node = this.parseExpression();
      this.expect(")");
      return node;
    }

    if (token.type === "ident") {
      const upper = token.text.toUpperCase();
      if (upper === "TRUE" || upper === "FALSE") {
        this.next();
        return { type: "boolean", value: upper === "TRUE" };
      }
      this.next();
      // A bare word with no parentheses is either a whole-column
      // reference ("A" in SUM(A)) or one of Metabase's zero-argument
      // functions, which are written without them. Column letters win
      // unless the word is one of those functions, since "A" through
      // "ZZZ" are overwhelmingly more likely to be columns.
      if (this.peek().type !== "(") {
        if (this.peek().type === ":") {
          const startCol = asColumnLetters(upper);
          if (startCol != null) {
            this.next();
            const endToken = this.expect("ident");
            const endCol = asColumnLetters(endToken.text.toUpperCase());
            if (endCol == null) {
              throw new FormulaParseError(
                `"${endToken.text}" isn't a column letter`,
              );
            }
            return {
              type: "columnRange",
              startCol: Math.min(startCol, endCol),
              endCol: Math.max(startCol, endCol),
            };
          }
        }
        if (!ZERO_ARGUMENT_FUNCTIONS.has(upper)) {
          const col = asColumnLetters(upper);
          if (col != null) {
            return { type: "columnRange", startCol: col, endCol: col };
          }
        }
        return { type: "call", name: upper, args: [] };
      }
      this.expect("(");
      const args: FormulaAstNode[] = [];
      if (this.peek().type !== ")") {
        args.push(this.parseExpression());
        while (this.peek().type === ",") {
          this.next();
          args.push(this.parseExpression());
        }
      }
      this.expect(")");
      return { type: "call", name: token.text.toUpperCase(), args };
    }

    throw new FormulaParseError(
      `Unexpected token "${token.text || "end of formula"}" in formula`,
    );
  }
}

/** Parses a formula string (without the leading "="). */
export function parseFormula(source: string): FormulaAstNode {
  const trimmed = source.trim();
  if (trimmed === "") {
    throw new FormulaParseError("Formula is empty");
  }
  return new Parser(tokenize(trimmed)).parse();
}

export interface FormulaEvalContext {
  /** Returns the numeric value at (rowIndex, colIndex), or null if blank/non-numeric. */
  getCellValue(rowIndex: number, colIndex: number): number | null;
  /** How many rows the grid holds, which is what a whole-column
   * reference such as SUM(A) spans. Only the rows actually loaded can be
   * summed here; the database's own total may be larger. */
  rowCount: number;
  /** Column index for a column referenced by name, so SUM([Subtotal])
   * can be summed here rather than being sent away as unevaluable. */
  getColumnIndex(name: string): number | null;
}

const AGGREGATE_FUNCTIONS = new Set(["SUM", "AVERAGE", "COUNT", "MIN", "MAX"]);

function effectiveRow(
  ref: { row: number; absoluteRow: boolean },
  targetRow: number,
  anchorRow: number,
) {
  return ref.absoluteRow ? ref.row : ref.row - anchorRow + targetRow;
}

function collectColumnValues(
  node: Extract<FormulaAstNode, { type: "columnRange" }>,
  ctx: FormulaEvalContext,
): number[] {
  const values: number[] = [];
  for (let row = 0; row < ctx.rowCount; row++) {
    for (let col = node.startCol; col <= node.endCol; col++) {
      const value = ctx.getCellValue(row, col);
      if (value != null && Number.isFinite(value)) {
        values.push(value);
      }
    }
  }
  return values;
}

function collectRangeValues(
  node: Extract<FormulaAstNode, { type: "range" }>,
  targetRow: number,
  ctx: FormulaEvalContext,
  anchorRow: number,
): number[] {
  const startRow = effectiveRow(node.start, targetRow, anchorRow);
  const endRow = effectiveRow(node.end, targetRow, anchorRow);
  const startCol = Math.min(node.start.col, node.end.col);
  const endCol = Math.max(node.start.col, node.end.col);
  const [fromRow, toRow] = [
    Math.min(startRow, endRow),
    Math.max(startRow, endRow),
  ];

  const values: number[] = [];
  for (let row = fromRow; row <= toRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const value = ctx.getCellValue(row, col);
      if (value != null && Number.isFinite(value)) {
        values.push(value);
      }
    }
  }
  return values;
}

function evalNode(
  node: FormulaAstNode,
  targetRow: number,
  ctx: FormulaEvalContext,
  anchorRow: number,
): number {
  switch (node.type) {
    case "number":
      return node.value;

    case "cellRef": {
      const value = ctx.getCellValue(
        effectiveRow(node, targetRow, anchorRow),
        node.col,
      );
      if (value == null || !Number.isFinite(value)) {
        throw new FormulaEvalError("#VALUE!");
      }
      return value;
    }

    case "unaryMinus":
      return -evalNode(node.operand, targetRow, ctx, anchorRow);

    case "binary": {
      const left = evalNode(node.left, targetRow, ctx, anchorRow);
      const right = evalNode(node.right, targetRow, ctx, anchorRow);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          if (right === 0) {
            throw new FormulaEvalError("#DIV/0!");
          }
          return left / right;
        case "^":
          return Math.pow(left, right);
        default:
          throw new FormulaEvalError("#SERVER!");
      }
    }

    case "range":
    case "columnRange":
      throw new FormulaEvalError(
        "A range can only be used as a function argument",
      );

    // The local evaluator is deliberately numbers-only. Anything below is
    // handed to the database instead of being reimplemented here, so that
    // text, dates and null handling match what a query would really
    // return. requiresServerEvaluation routes these away before they get
    // this far; reaching here means that routing was skipped.
    case "string":
    case "boolean":
    case "columnRef":
    case "not":
      throw new FormulaEvalError("#SERVER!");

    case "call": {
      const { name, args } = node;

      // Aggregate functions accept either a single range argument, or a
      // list of scalar expressions (SUM(A1,B1,C1)).
      if (AGGREGATE_FUNCTIONS.has(name)) {
        const [firstArg] = args;
        let values: number[];
        if (args.length === 1 && firstArg.type === "range") {
          values = collectRangeValues(firstArg, targetRow, ctx, anchorRow);
        } else if (args.length === 1 && firstArg.type === "columnRange") {
          values = collectColumnValues(firstArg, ctx);
        } else if (args.length === 1 && firstArg.type === "columnRef") {
          // SUM([Subtotal]) means the whole column, same as SUM(D). This
          // is Metabase's own spelling, so it's worth accepting.
          const col = ctx.getColumnIndex(firstArg.name);
          if (col == null) {
            throw new FormulaEvalError(
              `#REF! (no column named ${firstArg.name})`,
            );
          }
          values = collectColumnValues(
            { type: "columnRange", startCol: col, endCol: col },
            ctx,
          );
        } else {
          values = args.map((arg) => evalNode(arg, targetRow, ctx, anchorRow));
        }

        switch (name) {
          case "SUM":
            return values.reduce((sum, v) => sum + v, 0);
          case "COUNT":
            return values.length;
          case "AVERAGE":
            if (values.length === 0) {
              throw new FormulaEvalError("#DIV/0!");
            }
            return values.reduce((sum, v) => sum + v, 0) / values.length;
          case "MIN":
            if (values.length === 0) {
              throw new FormulaEvalError("#VALUE!");
            }
            return Math.min(...values);
          case "MAX":
            if (values.length === 0) {
              throw new FormulaEvalError("#VALUE!");
            }
            return Math.max(...values);
        }
      }

      if (name === "ROUND") {
        const value = evalNode(args[0], targetRow, ctx, anchorRow);
        const digits = args[1]
          ? evalNode(args[1], targetRow, ctx, anchorRow)
          : 0;
        const factor = Math.pow(10, digits);
        return Math.round(value * factor) / factor;
      }

      if (name === "ABS") {
        return Math.abs(evalNode(args[0], targetRow, ctx, anchorRow));
      }

      throw new FormulaEvalError(`#NAME? (unknown function ${name})`);
    }
  }
  throw new FormulaEvalError("#ERROR!");
}

/**
 * Evaluates a parsed formula for a given (0-based) target row.
 *
 * `anchorRow` is the (0-based) row the formula was originally typed into —
 * relative references are stored as literal row indices, so this is what
 * turns e.g. a literal `A6` typed while editing row 5 into "one row below
 * wherever this gets evaluated" instead of a fixed row 6 everywhere.
 * Defaults to 0 (row 1) for formulas authored without a specific anchor.
 */
export function evaluateFormula(
  ast: FormulaAstNode,
  targetRow: number,
  ctx: FormulaEvalContext,
  anchorRow = 0,
): number {
  return evalNode(ast, targetRow, ctx, anchorRow);
}

/** Walks the AST and returns every column index the formula references. */
export function getReferencedColumns(node: FormulaAstNode): number[] {
  const cols = new Set<number>();
  const visit = (n: FormulaAstNode) => {
    switch (n.type) {
      case "cellRef":
        cols.add(n.col);
        break;
      case "range":
        for (let c = n.start.col; c <= n.end.col; c++) {
          cols.add(c);
        }
        break;
      case "columnRange":
        for (let c = n.startCol; c <= n.endCol; c++) {
          cols.add(c);
        }
        break;
      case "unaryMinus":
      case "not":
        visit(n.operand);
        break;
      case "binary":
        visit(n.left);
        visit(n.right);
        break;
      case "call":
        n.args.forEach(visit);
        break;
    }
  };
  visit(node);
  return [...cols];
}

/**
 * The only functions this module computes in the browser. Everything else
 * a user can type is a Metabase expression function, which the database
 * evaluates — see requiresServerEvaluation.
 */
export const LOCALLY_EVALUABLE_FUNCTIONS = new Set([
  "SUM",
  "AVERAGE",
  "COUNT",
  "MIN",
  "MAX",
  "ROUND",
  "ABS",
]);

const PREDICATE_OPERATORS = new Set<FormulaOperator>([
  "=",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "AND",
  "OR",
]);

/**
 * True when a formula uses anything outside this module's numbers-only
 * world: text, booleans, a column referenced by name, a comparison, or
 * any of Metabase's ~64 expression functions.
 *
 * Such a formula is never evaluated here. It's translated to a Metabase
 * custom column and computed by the database, which is both far less code
 * than reimplementing the function library and the only way to get null
 * handling, collation and timezone behaviour that agrees with the rest of
 * the question.
 */
export function requiresServerEvaluation(node: FormulaAstNode): boolean {
  switch (node.type) {
    case "string":
    case "boolean":
    case "columnRef":
      return true;
    case "not":
      return true;
    case "number":
    case "cellRef":
    case "range":
    case "columnRange":
      return false;
    case "unaryMinus":
      return requiresServerEvaluation(node.operand);
    case "binary":
      return (
        PREDICATE_OPERATORS.has(node.op) ||
        requiresServerEvaluation(node.left) ||
        requiresServerEvaluation(node.right)
      );
    case "call":
      return (
        !LOCALLY_EVALUABLE_FUNCTIONS.has(node.name) ||
        node.args.some(requiresServerEvaluation)
      );
  }
}

/**
 * requiresServerEvaluation for raw formula text. A formula that doesn't
 * parse returns false so it follows the normal local path and the user
 * sees the parse error, rather than being sent to the query compiler to
 * fail there with a less specific message.
 */
export function needsServerEvaluation(formula: string): boolean {
  try {
    return requiresServerEvaluation(parseFormula(formula));
  } catch {
    return false;
  }
}
