/**
 * Rule to require key props for JSX elements in jt`` tagged templates
 * jt`Something ${(<div>hello</div>)}` is an error as react will complain about the missing key prop
 */

const ERROR_MESSAGE =
  "JSX elements in jt`` tagged templates must have a key prop. Add key='unique-identifier' to the JSX element.";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require key props for JSX elements in jt`` tagged templates",
    },
    schema: [], // no options
    fixable: null,
  },

  create(context) {
    // Track fragments that have reported errors to avoid double reporting
    const fragmentsWithErrors = new Set();

    /**
     * Check if a JSX element has a key prop
     * @param {Object} node - JSX element node
     * @returns {boolean} - true if element has key prop, false otherwise
     */
    function hasKeyProp(node) {
      if (!node.openingElement || !node.openingElement.attributes) {
        return false;
      }
      return node.openingElement.attributes.some(
        (attr) =>
          attr.type === "JSXAttribute" && attr.name && attr.name.name === "key",
      );
    }

    /**
     * Check if a JSX element is a direct child of a template expression
     */
    function isDirectChildOfTemplateExpression(node) {
      let current = node.parent;

      while (current) {
        // If we encounter another JSX element before reaching a template,
        // then we're nested inside JSX, not a direct template child
        if (current.type === "JSXElement" || current.type === "JSXFragment") {
          return false;
        }

        // If we find a template literal, we're a direct child
        if (current.type === "TemplateLiteral") {
          return true;
        }

        current = current.parent;
      }

      return false;
    }

    /**
     * Check if we're inside a jt`` tagged template and are a direct child
     */
    function isInJtTaggedTemplate(node) {
      // Only check direct children of template expressions
      if (!isDirectChildOfTemplateExpression(node)) {
        return false;
      }

      let current = node.parent;

      while (current) {
        // If we find a template literal, check if it's a jt tagged template
        if (current.type === "TemplateLiteral") {
          const templateParent = current.parent;
          if (
            templateParent &&
            templateParent.type === "TaggedTemplateExpression"
          ) {
            // Check if the tag is a member expression ending with 'jt' (like .jt``)
            if (
              templateParent.tag.type === "MemberExpression" &&
              templateParent.tag.property &&
              templateParent.tag.property.name === "jt"
            ) {
              return true;
            }
            // Check if the tag is an identifier 'jt' (like jt``)
            if (
              templateParent.tag.type === "Identifier" &&
              templateParent.tag.name === "jt"
            ) {
              return true;
            }
          }
          return false; // Template literal but not jt tagged
        }

        current = current.parent;
      }

      return false;
    }

    /**
     * Check if a JSX element is within a fragment that has errors
     */
    function isInFragmentWithErrors(node) {
      let current = node.parent;
      while (current) {
        if (
          current.type === "JSXFragment" &&
          fragmentsWithErrors.has(current)
        ) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    return {
      JSXElement(node) {
        // Only check JSX elements that are inside jt`` tagged templates
        // Skip if the element is within a fragment that already has errors reported
        if (
          isInJtTaggedTemplate(node) &&
          !hasKeyProp(node) &&
          !isInFragmentWithErrors(node)
        ) {
          context.report({
            node,
            message: ERROR_MESSAGE,
          });
        }
      },

      JSXFragment(node) {
        // Check JSX fragments - they're allowed if all children have keys
        if (isInJtTaggedTemplate(node)) {
          const allChildrenHaveKeys = node.children.every((child) => {
            if (child.type === "JSXElement") {
              return hasKeyProp(child);
            }
            // JSXText, JSXExpressionContainer, etc. are fine
            return true;
          });

          if (!allChildrenHaveKeys) {
            // Track this fragment as having errors to prevent double reporting
            fragmentsWithErrors.add(node);
            context.report({
              node,
              message:
                "JSX fragments in jt`` tagged templates must have all JSX element children with key props.",
            });
          }
        }
      },
    };
  },
};
