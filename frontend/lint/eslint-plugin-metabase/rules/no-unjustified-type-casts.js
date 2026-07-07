/**
 * @fileoverview Require every TypeScript type cast (`expr as T`) to be preceded
 * by a comment explaining why the cast is necessary.
 *
 * Type casts silently override the type checker, so most of them are either
 * unnecessary or hide a non-obvious assumption. Forcing the author to write a
 * short comment makes them pause and ask "do I actually need this?", and keeps
 * the reasoning for the ones that survive documented in the code.
 *
 * A cast is considered justified when a line or block comment appears either
 * immediately before the cast expression (inline) or on the line above the
 * statement that contains it.
 *
 * `as const` is exempt — it is an assertion of literalness, not a cast to an
 * unrelated type, and never hides a mistaken assumption.
 *
 * Chained casts (`x as unknown as T`) only need a single comment: only the
 * outermost cast of a chain is reported.
 */

const ERROR_MESSAGE =
  "Type casts (`as T`) must be preceded by a comment explaining why the cast is necessary.";

// A cast is anchored to the nearest ancestor that is a direct child of one of
// these containers — i.e. the enclosing statement or class member. A comment
// placed above that anchor justifies the cast.
const STATEMENT_CONTAINER_TYPES = new Set([
  "BlockStatement",
  "Program",
  "SwitchCase",
  "StaticBlock",
  "ClassBody",
  "TSModuleBlock",
]);

const isAsConst = (node) => {
  const type = node.typeAnnotation;
  return (
    type != null &&
    type.type === "TSTypeReference" &&
    type.typeName != null &&
    type.typeName.type === "Identifier" &&
    type.typeName.name === "const"
  );
};

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
    // Intentionally not fixable: auto-inserting a placeholder comment would
    // defeat the point of the rule, which is to make the author stop and think
    // about whether the cast is really necessary.
    fixable: null,
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    // A comment "leads" an anchor when it sits inline right before it or on the
    // line directly above it (no blank line in between).
    const hasLeadingComment = (anchor) => {
      const comments = sourceCode.getCommentsBefore(anchor);
      if (comments.length === 0) {
        return false;
      }
      const closest = comments[comments.length - 1];
      const anchorLine = anchor.loc.start.line;
      const commentEndLine = closest.loc.end.line;
      return commentEndLine === anchorLine || commentEndLine === anchorLine - 1;
    };

    // The nearest ancestor statement, so a comment placed above the whole
    // statement counts even when the cast is nested inside an expression.
    const getEnclosingStatement = (node) => {
      let current = node;
      while (
        current.parent != null &&
        !STATEMENT_CONTAINER_TYPES.has(current.parent.type)
      ) {
        current = current.parent;
      }
      return current;
    };

    return {
      TSAsExpression(node) {
        if (isAsConst(node)) {
          return;
        }
        // Only report the outermost cast of a chain like `x as unknown as T`.
        if (node.parent != null && node.parent.type === "TSAsExpression") {
          return;
        }
        if (
          hasLeadingComment(node) ||
          hasLeadingComment(getEnclosingStatement(node))
        ) {
          return;
        }
        context.report({
          node,
          message: ERROR_MESSAGE,
        });
      },
    };
  },
};
