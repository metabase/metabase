/**
 * @fileoverview Require every TypeScript type cast (`expr as T`) to be preceded
 * by a comment explaining why the cast is necessary.
 *
 * See https://app.notion.com/p/metabase/147-Require-justification-for-type-casts-36c69354c90180bd91ebee21b4566d0c
 */

const ERROR_MESSAGE =
  "Type casts (`as T`) must be preceded by a comment explaining why the cast is necessary.";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require a comment justifying every TypeScript type cast (`as T`)",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    fixable: null,
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      TSAsExpression(node) {
        if (isAsConst(node)) {
          return;
        }

        if (!isOuterMostAsExpression(node)) {
          return;
        }

        if (
          hasLeadingComment(sourceCode, node) ||
          hasLeadingComment(sourceCode, getLineStartToken(sourceCode, node)) ||
          hasLeadingComment(sourceCode, getGroupingStartToken(sourceCode, node))
        ) {
          return;
        }

        context.report({ node, message: ERROR_MESSAGE });
      },
    };
  },
};

function isAsConst(node) {
  const type = node.typeAnnotation;

  return (
    type != null &&
    type.type === "TSTypeReference" &&
    type.typeName != null &&
    type.typeName.type === "Identifier" &&
    type.typeName.name === "const"
  );
}

function isOuterMostAsExpression(node) {
  return !node.parent || node.parent.type !== "TSAsExpression";
}

function hasLeadingComment(sourceCode, anchor) {
  const comments = sourceCode.getCommentsBefore(anchor);

  if (comments.length === 0) {
    return false;
  }

  const closest = comments[comments.length - 1];
  const anchorLine = anchor.loc.start.line;
  const commentEndLine = closest.loc.end.line;
  return commentEndLine === anchorLine || commentEndLine === anchorLine - 1;
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

  while (previous != null && previous.loc.end.line === token.loc.start.line) {
    token = previous;
    previous = sourceCode.getTokenBefore(token);
  }

  return token;
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
