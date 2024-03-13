import type { NodeType, Node } from "./types";

/*
 * This file specifies most of the syntax for the Metabase handwritten custom
 * expression parser. The rest is contained in the parser special cases
 *
 * The structure of this file:
 *   1. Declare all of the ASTypes (types of nodes that appear in the abstract
 *       syntax tree)
 *   2. Associate various properties with those ASTypes that determine the
 *       overall shape of the grammar (# of operands, scope info, etc.)
 *   3. Declare more grammatical rules as functions/generate them from tables
 *       (parent/child Type constraints, operator precedence tiers)
 *   4. Export getASType(), which the parser uses to override the Type guesses
 *       that the lexer makes based on contextual information
 */

export const FIELD = {} as NodeType;
export const ADD = {} as NodeType;
export const LOGICAL_AND = {} as NodeType;
export const ARG_LIST = {} as NodeType;
export const BAD_TOKEN = {} as NodeType;
export const CALL = {} as NodeType;
export const COMMA = {} as NodeType;
export const END_OF_INPUT = {} as NodeType;
export const EQUALITY = {} as NodeType;
export const NUMBER = {} as NodeType;
export const BOOLEAN = {} as NodeType;
export const LOGICAL_NOT = {} as NodeType;
export const NEGATIVE = {} as NodeType;
export const LOGICAL_OR = {} as NodeType;
export const COMPARISON = {} as NodeType;
export const GROUP = {} as NodeType;
export const GROUP_CLOSE = {} as NodeType;
export const ROOT = {} as NodeType;
export const MULDIV_OP = {} as NodeType;
export const STRING = {} as NodeType;
export const SUB = {} as NodeType;
export const IDENTIFIER = {} as NodeType;
export const WS = {} as NodeType;

function operand(leftOperands: number, rightOperands: number) {
  return {
    leftOperands,
    rightOperands,
    expectedChildCount: leftOperands + rightOperands,
  };
}

function setAttributes(...syntaxRules: [Partial<NodeType>, NodeType[]][]) {
  for (const [values, types] of syntaxRules) {
    for (const type of types) {
      Object.assign(type, values);
    }
  }
}

const ALL_NODES = [
  ADD,
  LOGICAL_AND,
  ARG_LIST,
  BAD_TOKEN,
  CALL,
  COMMA,
  END_OF_INPUT,
  EQUALITY,
  NUMBER,
  BOOLEAN,
  NEGATIVE,
  LOGICAL_NOT,
  LOGICAL_OR,
  COMPARISON,
  GROUP,
  GROUP_CLOSE,
  ROOT,
  MULDIV_OP,
  STRING,
  SUB,
  FIELD,
  IDENTIFIER,
  WS,
];

// Set default values for AST node attributes
setAttributes([
  {
    skip: false,

    leftOperands: 0,
    rightOperands: 0,
    expectedChildCount: 0,
    checkChildConstraints: () => null,

    requiresTerminator: null,
    ignoresTerminator: [],
    isTerminator: false,

    precedence: -Infinity,
    resolvesAs: null,
    expectedTypes: null,
  },

  ALL_NODES,
]);

setAttributes(
  // Prefix Operators
  [operand(0, 1), [CALL, NEGATIVE, LOGICAL_NOT]],

  // Infix Operators
  [
    operand(1, 1),
    [MULDIV_OP, ADD, SUB, COMPARISON, EQUALITY, LOGICAL_AND, LOGICAL_OR],
  ],

  // Open Expressions (various paren types, blocks, etc.) and their terminators
  [{ expectedChildCount: Infinity }, [ARG_LIST, ROOT, GROUP]],
  [{ ignoresTerminator: [COMMA] }, [ARG_LIST]],
  [{ requiresTerminator: END_OF_INPUT }, [ROOT]],
  [{ requiresTerminator: GROUP_CLOSE }, [ARG_LIST, GROUP]],
  [{ isTerminator: true }, [COMMA, END_OF_INPUT, GROUP_CLOSE]],

  // Skip whitespace
  [{ skip: true }, [WS]],

  // Known types
  [{ resolvesAs: "string" }, [STRING]],
  [{ resolvesAs: "number" }, [ADD, NUMBER, NEGATIVE, MULDIV_OP, SUB]],
  [
    { resolvesAs: "boolean" },
    [LOGICAL_AND, EQUALITY, LOGICAL_NOT, LOGICAL_OR, COMPARISON, BOOLEAN],
  ],

  // Expected types
  [
    { expectedTypes: ["number"] },
    [ADD, NUMBER, NEGATIVE, MULDIV_OP, SUB, COMPARISON],
  ],
  [{ expectedTypes: ["boolean"] }, [LOGICAL_NOT, LOGICAL_AND, LOGICAL_OR]],
  [{ expectedTypes: ["boolean", "number", "string"] }, [EQUALITY]],
);

/*
 * Child constraints govern how many children an AST node can have and where
 * thare placed relative to the node.
 *
 * These are syntax rules, rather than semantic ones, since that is handled
 * later by a different pass. i.e. LOGICAL_AND and LOGICAL_OR rules don't check
 * that the right and left side resolve to boolean types.
 *
 * `checkChildConstraints` returns an object with diagnostic information if
 * there is a constraint violation, null otherwise.
 */

function childConstraintByPosition(...positions: NodeType[][]) {
  return (node: Node) => {
    for (let i = 0; i < positions.length; i++) {
      if (!node.children[i]) {
        return { position: i, expected: positions };
      } else if (!positions[i].includes(node.children[i].type)) {
        return { position: i, child: node.children[i], expected: positions };
      }
    }
    return null;
  };
}

LOGICAL_NOT.checkChildConstraints = childConstraintByPosition([
  FIELD,
  IDENTIFIER,
  LOGICAL_NOT,
  LOGICAL_OR,
  LOGICAL_AND,
  COMPARISON,
  EQUALITY,
  CALL,
  GROUP,

  NEGATIVE,
  NUMBER,
  BOOLEAN,
  STRING,
  ADD,
  SUB,
  MULDIV_OP,
]);

NEGATIVE.checkChildConstraints = childConstraintByPosition([
  NUMBER,
  FIELD,
  IDENTIFIER,
  NEGATIVE,
  CALL,
  GROUP,
  ADD,
  SUB,
  MULDIV_OP,

  LOGICAL_NOT,
  LOGICAL_OR,
  LOGICAL_AND,
  COMPARISON,
  STRING,
]);
CALL.checkChildConstraints = childConstraintByPosition([ARG_LIST]);

function anyChildConstraint(...acceptableTypes: NodeType[]) {
  return (node: Node) => {
    for (const child of node.children) {
      if (!acceptableTypes.includes(child.type)) {
        return { child };
      }
    }
    return null;
  };
}

ROOT.checkChildConstraints = anyChildConstraint(
  FIELD,
  ADD,
  LOGICAL_AND,
  CALL,
  EQUALITY,
  NUMBER,
  BOOLEAN,
  NEGATIVE,
  LOGICAL_NOT,
  MULDIV_OP,
  LOGICAL_OR,
  COMPARISON,
  GROUP,
  STRING,
  SUB,
  IDENTIFIER,
);

/*
 * This defines the operator precedence in order from highest priority to lowest
 * priority. When a node with a higher precedence is encountered, the node with
 * the lower precedence is "reparented" into the higher node.
 */
[
  [CALL],
  [FIELD],
  [NEGATIVE],
  [MULDIV_OP],
  [ADD, SUB],
  [EQUALITY, COMPARISON],
  [LOGICAL_NOT],
  [LOGICAL_AND],
  [LOGICAL_OR],
  [BOOLEAN, IDENTIFIER],
].forEach((tier, precedence, tiers) => {
  for (const type of tier) {
    type.precedence = tiers.length - precedence;
  }
});

// Give each node
for (const [key, value] of Object.entries(ALL_NODES)) {
  value.name = key;
}

SUB.name = "SUBTRACT";
WS.name = "WHITESPACE";
