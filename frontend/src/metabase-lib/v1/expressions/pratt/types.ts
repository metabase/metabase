import { CompileError } from "../errors";

type VariableKind = "dimension" | "segment" | "aggregation" | "expression";
type Type = VariableKind | "string" | "number" | "boolean";
type VariableId = number;

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
  resolvedType: Type | VariableId;
  parent: Node | null;
  token: Token | null;
  isRoot?: boolean;
}

export interface NodeType {
  name?: string;

  // Should the parser ignore this sort of token entirely (whitespace)
  skip: boolean;

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

  // The type this node resolves to, if it can be deduced early on. If null, the
  // parser assigns an integer value for substitutions instead
  resolvesAs: Type | null;

  // The expectedType of the child nodes
  expectedTypes: Type[] | null;
}

type HookFn = (token: Token, node: Node) => void;
type HookErrFn = (token: Token, node: Node, err: CompileError) => void;
type NodeErrFn = (node: Node, err: CompileError) => void;
export interface Hooks {
  onIteration?: HookFn;
  onCreateNode?: HookFn;
  onPlaceNode?: (node: Node, parent: Node) => void;
  onSkipToken?: HookFn;
  onReparentNode?: HookFn;
  onCompleteNode?: HookFn;
  onTerminatorToken?: HookFn;
  onBadToken?: HookErrFn;
  onUnexpectedTerminator?: HookErrFn;
  onMissinChildren?: HookErrFn;
  onChildConstraintViolation?: NodeErrFn;
}

class AssertionError extends Error {
  data?: any;

  constructor(message: string, data?: any) {
    super(`Assertion failed: ${message}`);
    this.data = data;
  }
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
    throw new AssertionError(msg, data || {});
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
