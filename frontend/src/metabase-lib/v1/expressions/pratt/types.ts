import { CompileError } from "../errors";

export class Token {
  type: NodeType;
  text: string;
  value?: string;

  pos: number;
  length: number;

  constructor({
    type,
    pos,
    length,
    text,
    value,
  }: {
    type: NodeType;
    text: string;
    value?: string;
    length: number;
    pos: number;
  }) {
    this.type = type;
    this.pos = pos;
    this.length = length;

    this.text = text;
    this.value = value;
  }
  get len(): number {
    return this.length;
  }
  get start(): number {
    return this.pos;
  }
  get end(): number {
    return this.pos + this.length;
  }
  get from(): number {
    return this.start;
  }
  get to(): number {
    return this.end;
  }
}

export interface Node {
  type: NodeType;
  children: Node[];
  complete: boolean;
  parent: Node | null;
  token: Token | null;
}

export interface NodeType {
  name?: string;

  // Number of operands to expect for this node on the left side
  leftOperands: number;
  // Number of operands to expect for this node on the right side
  rightOperands: number;
  // Maximum number of children before this node is considered complete. May be
  // `Infinity` for nodes lik ARG_LIST, or number of left+right operands
  expectedChildCount: number;
  // Check child constraints
  checkChildConstraints: (
    node: Node,
  ) => { position?: number; child?: Node } | null;

  // For open expressions, this is the AST type of tokens that close the
  // expression  (e.g. GROUP_CLOSE for GROUP).
  requiresTerminator: NodeType | null;
  // For open expressions, this is a list of AST types that should be considered
  // a  "separator" (e.g. COMMA for ARG_LIST).
  ignoresTerminator: NodeType[];
  // Does this token type terminate the current expression (unless exempted by
  // .ignoresTerminator)?
  isTerminator: boolean;

  // The precedence to use for operator parsing conflicts. Higher wins.
  precedence: number;
}

/**
 * Assert compiler invariants and assumptions.
 * Throws a non-friendly error if the condition is false.
 */
export function assert(
  condition: any,
  msg: string,
  data?: any,
): asserts condition {
  if (!condition) {
    throw new Error(msg, data || {});
  }
}

/**
 * Check assumptions that might fail based on the query source.
 * Throws a user-friendly error if the condition is false.
 */
export function check(
  condition: any,
  msg: string,
  node: Node,
): asserts condition {
  if (!condition) {
    throw new CompileError(msg, node);
  }
}
