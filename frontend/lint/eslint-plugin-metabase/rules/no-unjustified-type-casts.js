/**
 * @fileoverview Require every TypeScript type cast (`expr as T` or `<T>expr`)
 * to be preceded by a comment explaining why the cast is necessary.
 *
 * See https://app.notion.com/p/metabase/147-Require-justification-for-type-casts-36c69354c90180bd91ebee21b4566d0c
 */

const ERROR_MESSAGE =
  "Type casts (`expr as T`, `<T>expr`) must be preceded by a comment explaining why the cast is necessary.";

const CAST_NODE_TYPES = new Set(["TSAsExpression", "TSTypeAssertion"]);

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require a comment justifying every TypeScript type cast (`expr as T`, `<T>expr`)",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    fixable: null,
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    function checkCast(node) {
      if (isConstAssertion(node)) {
        return;
      }

      if (!isOutermostCast(node)) {
        return;
      }

      if (isJustified(sourceCode, node)) {
        return;
      }

      context.report({ node, message: ERROR_MESSAGE });
    }

    return {
      TSAsExpression: checkCast,
      TSTypeAssertion: checkCast,
    };
  },
};

function isConstAssertion(node) {
  const type = node.typeAnnotation;

  return (
    type != null &&
    type.type === "TSTypeReference" &&
    type.typeName != null &&
    type.typeName.type === "Identifier" &&
    type.typeName.name === "const"
  );
}

function isOutermostCast(node) {
  return !node.parent || !CAST_NODE_TYPES.has(node.parent.type);
}

function isJustified(sourceCode, node) {
  if (hasSameLineCommentBefore(sourceCode, node)) {
    return true;
  }

  const lineStartToken = getLineStartToken(
    sourceCode,
    sourceCode.getFirstToken(node),
  );

  if (
    hasSameLineCommentBefore(sourceCode, lineStartToken) ||
    isJustificationLine(sourceCode, lineStartToken.loc.start.line - 1)
  ) {
    return true;
  }

  const groupingStartToken = getGroupingStartToken(sourceCode, node);

  return (
    hasSameLineCommentBefore(sourceCode, groupingStartToken) ||
    isJustificationLine(sourceCode, groupingStartToken.loc.start.line - 1)
  );
}

function hasSameLineCommentBefore(sourceCode, anchor) {
  const comments = sourceCode.getCommentsBefore(anchor);

  if (comments.length === 0) {
    return false;
  }

  const closest = comments[comments.length - 1];
  return closest.loc.end.line === anchor.loc.start.line;
}

function isJustificationLine(sourceCode, line) {
  if (line < 1) {
    return false;
  }

  const comment = getCommentEndingOnLine(sourceCode, line);

  if (comment == null) {
    return false;
  }

  const spansLine = (token) =>
    token.loc.end.line >= comment.loc.start.line &&
    token.loc.start.line <= comment.loc.end.line;

  let before = getCodeTokenBefore(sourceCode, comment);
  let after = getCodeTokenAfter(sourceCode, comment);

  if (
    before != null &&
    after != null &&
    isEmptyJsxContainerBrace(sourceCode, before, after)
  ) {
    before = getCodeTokenBefore(sourceCode, before);
    after = getCodeTokenAfter(sourceCode, after);
  }

  if (before != null && spansLine(before)) {
    // oxfmt hoists a ternary branch's leading comment onto the operator line
    // (`? // reason`), so a lone `?`/`:` before the comment is allowed.
    if (!isTernaryBranchStart(before)) {
      return false;
    }

    const beforeTernary = getCodeTokenBefore(sourceCode, before);

    if (beforeTernary != null && spansLine(beforeTernary)) {
      return false;
    }
  }

  if (after != null && spansLine(after)) {
    return false;
  }

  return true;
}

function isTernaryBranchStart(token) {
  return (
    token.type === "Punctuator" && (token.value === "?" || token.value === ":")
  );
}

function getCommentEndingOnLine(sourceCode, line) {
  const comments = sourceCode
    .getAllComments()
    .filter((comment) => comment.loc.end.line === line);

  return comments.length > 0 ? comments[comments.length - 1] : null;
}

function getCodeTokenBefore(sourceCode, tokenOrComment) {
  let token = sourceCode.getTokenBefore(tokenOrComment);

  while (token != null && isBlankJsxText(token)) {
    token = sourceCode.getTokenBefore(token);
  }

  return token;
}

function getCodeTokenAfter(sourceCode, tokenOrComment) {
  let token = sourceCode.getTokenAfter(tokenOrComment);

  while (token != null && isBlankJsxText(token)) {
    token = sourceCode.getTokenAfter(token);
  }

  return token;
}

function isEmptyJsxContainerBrace(sourceCode, openBrace, closeBrace) {
  if (
    openBrace.type !== "Punctuator" ||
    openBrace.value !== "{" ||
    closeBrace.type !== "Punctuator" ||
    closeBrace.value !== "}"
  ) {
    return false;
  }

  const container = sourceCode.getNodeByRangeIndex(openBrace.range[0]);

  return (
    container != null &&
    container.type === "JSXExpressionContainer" &&
    container.expression.type === "JSXEmptyExpression" &&
    container.range[0] === openBrace.range[0] &&
    container.range[1] === closeBrace.range[1]
  );
}

function getGroupingStartToken(sourceCode, node) {
  let token = getLineStartToken(sourceCode, sourceCode.getFirstToken(node));
  let previous = sourceCode.getTokenBefore(token);

  while (previous != null && isGroupingParen(sourceCode, previous)) {
    token = getLineStartToken(sourceCode, previous);
    previous = sourceCode.getTokenBefore(token);
  }

  return token;
}

function getLineStartToken(sourceCode, startToken) {
  let token = startToken;
  let previous = sourceCode.getTokenBefore(token);

  while (
    previous != null &&
    previous.loc.end.line === token.loc.start.line &&
    !isMultilineJsxText(previous)
  ) {
    token = previous;
    previous = sourceCode.getTokenBefore(token);
  }

  return token;
}

function isMultilineJsxText(token) {
  return (
    token.type === "JSXText" && token.loc.start.line !== token.loc.end.line
  );
}

function isBlankJsxText(token) {
  return token.type === "JSXText" && token.value.trim() === "";
}

function isGroupingParen(sourceCode, token) {
  if (token.type !== "Punctuator" || token.value !== "(") {
    return false;
  }

  const before = sourceCode.getTokenBefore(token);

  if (before == null) {
    return true;
  }

  if (before.type === "Identifier" || before.type === "PrivateIdentifier") {
    return false;
  }

  return !(
    before.type === "Punctuator" &&
    (before.value === ")" || before.value === "]" || before.value === "?.")
  );
}
