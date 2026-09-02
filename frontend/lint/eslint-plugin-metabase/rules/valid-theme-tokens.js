/**
 * @fileoverview Rule to enforce valid design-system scale tokens in Mantine style props
 *
 * Mantine's TypeScript scale unions accept any string (they union with
 * `(string & {})` so raw CSS values typecheck), so invalid tokens compile
 * silently and resolve to broken spacing/radius/shadows at runtime.
 *
 * This rule flags string literals assigned to known scale props
 * (`p`, `m`, `gap`, `radius`, `shadow`, …) that are not valid scale keys
 * and not raw CSS values.
 *
 * Vocabulary mirrors frontend/src/metabase/ui/theme.ts:
 * - spacing: xxxs…xxxl
 * - radius: xxxs…xl
 * - shadows: the theme's xs/xs_outline/sm/sm_outline/lg_outline plus the
 *   stock Mantine md/lg/xl elevations that stay usable at runtime.
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const SPACING_KEYS = [
  "xxxs",
  "xxs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "xxl",
  "xxxl",
];

const RADIUS_KEYS = ["xxxs", "xxs", "xs", "sm", "md", "lg", "xl"];

const SHADOW_KEYS = [
  "xs",
  "xs_outline",
  "sm",
  "sm_outline",
  "md",
  "lg",
  "lg_outline",
  "xl",
];

const RAW_CSS_VALUES = new Set([
  "auto",
  "inherit",
  "initial",
  "none",
  "normal",
  "unset",
]);

const SCALE_KEYS = {
  spacing: new Set(SPACING_KEYS),
  radius: new Set(RADIUS_KEYS),
  shadow: new Set(SHADOW_KEYS),
};

const SCALE_LIKE_VALUES = new Set([
  ...SPACING_KEYS,
  ...RADIUS_KEYS,
  ...SHADOW_KEYS,
]);

const PROP_TO_SCALE = {
  p: "spacing",
  px: "spacing",
  py: "spacing",
  pt: "spacing",
  pb: "spacing",
  pl: "spacing",
  pr: "spacing",
  padding: "spacing",
  paddingX: "spacing",
  paddingY: "spacing",
  paddingTop: "spacing",
  paddingBottom: "spacing",
  paddingLeft: "spacing",
  paddingRight: "spacing",
  ps: "spacing",
  pe: "spacing",
  m: "spacing",
  mx: "spacing",
  my: "spacing",
  mt: "spacing",
  mb: "spacing",
  ml: "spacing",
  mr: "spacing",
  ms: "spacing",
  me: "spacing",
  margin: "spacing",
  marginX: "spacing",
  marginY: "spacing",
  marginTop: "spacing",
  marginBottom: "spacing",
  marginLeft: "spacing",
  marginRight: "spacing",
  gap: "spacing",
  rowGap: "spacing",
  columnGap: "spacing",
  gutter: "spacing",
  spacing: "spacing",
  h: "spacing",
  w: "spacing",
  maw: "spacing",
  mah: "spacing",
  miw: "spacing",
  mih: "spacing",
  top: "spacing",
  right: "spacing",
  bottom: "spacing",
  left: "spacing",
  inset: "spacing",
  radius: "radius",
  bdrs: "radius",
  borderRadius: "radius",
  borderTopLeftRadius: "radius",
  borderTopRightRadius: "radius",
  borderBottomLeftRadius: "radius",
  borderBottomRightRadius: "radius",
  shadow: "shadow",
  boxShadow: "shadow",
};

const formatKeys = (keys) => keys.join(", ");

const getPropertyName = (node) => {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return undefined;
};

const getStringLiterals = (node) => {
  if (!node) {
    return [];
  }

  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? [node] : [];
    case "ConditionalExpression":
      return [
        ...getStringLiterals(node.consequent),
        ...getStringLiterals(node.alternate),
      ];
    case "ObjectExpression":
      return node.properties.flatMap((property) =>
        property.type === "Property" ? getStringLiterals(property.value) : [],
      );
    case "ArrayExpression":
      return node.elements.flatMap((element) =>
        element ? getStringLiterals(element) : [],
      );
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "ParenthesizedExpression":
      return getStringLiterals(node.expression);
    default:
      return [];
  }
};

const isTokenLike = (value, validateAllBareWords) => {
  if (validateAllBareWords) {
    return value.length > 1 && /^[a-z_]+$/.test(value);
  }
  return SCALE_LIKE_VALUES.has(value);
};

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require valid design-system scale tokens in Mantine style props",
      category: "Possible Errors",
      recommended: true,
    },
    schema: [], // no options
  },
  create: function (context) {
    const checkLiterals = (prop, scale, node, validateAllBareWords) => {
      for (const literal of getStringLiterals(node)) {
        const value = literal.value;
        if (
          isTokenLike(value, validateAllBareWords) &&
          !RAW_CSS_VALUES.has(value) &&
          !SCALE_KEYS[scale].has(value)
        ) {
          context.report({
            node: literal,
            message:
              `"${value}" is not a valid ${scale} token for "${prop}". ` +
              `Valid tokens: ${formatKeys([...SCALE_KEYS[scale]])}. `,
          });
        }
      }
    };

    return {
      JSXAttribute(node) {
        const prop = node.name.name;
        const scale = PROP_TO_SCALE[prop];
        if (!scale) {
          return;
        }
        const value = node.value;
        if (!value) {
          return;
        }
        const expression =
          value.type === "JSXExpressionContainer" ? value.expression : value;
        checkLiterals(prop, scale, expression, true);
      },
      Property(node) {
        const prop = getPropertyName(node.key);
        const scale = prop && PROP_TO_SCALE[prop];
        if (!scale) {
          return;
        }
        checkLiterals(prop, scale, node.value, false);
      },
    };
  },
};
