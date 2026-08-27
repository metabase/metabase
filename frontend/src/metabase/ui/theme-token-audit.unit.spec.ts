import { readFileSync } from "fs";

import { glob } from "glob";
import * as ts from "typescript";

import { getThemeOverrides } from "metabase/ui/theme";

type ScaleName = "spacing" | "radius" | "shadow";

type ScaleViolation = {
  file: string;
  line: number;
  prop: string;
  scale: ScaleName;
  value: string;
};

const PROP_TO_SCALE: Readonly<Record<string, ScaleName>> = {
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

const LEGACY_SCALE_KEYS = ["xs", "sm", "md", "lg", "xl"];
const RAW_CSS_VALUES = new Set([
  "auto",
  "inherit",
  "initial",
  "none",
  "normal",
  "unset",
]);

const getPropertyName = (name: ts.PropertyName | ts.JsxAttributeName) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return undefined;
};

const getStringLiterals = (node: ts.Node): ts.StringLiteralLike[] => {
  if (ts.isStringLiteralLike(node)) {
    return [node];
  }
  if (ts.isParenthesizedExpression(node)) {
    return getStringLiterals(node.expression);
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...getStringLiterals(node.whenTrue),
      ...getStringLiterals(node.whenFalse),
    ];
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) =>
      ts.isPropertyAssignment(property)
        ? getStringLiterals(property.initializer)
        : [],
    );
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap(getStringLiterals);
  }
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return getStringLiterals(node.expression);
  }

  return [];
};

const findScaleViolationsInSource = (
  file: string,
  sourceText: string,
  scaleKeys: Record<ScaleName, ReadonlySet<string>>,
): ScaleViolation[] => {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const scaleLikeValues = new Set([
    ...LEGACY_SCALE_KEYS,
    ...scaleKeys.spacing,
    ...scaleKeys.radius,
    ...scaleKeys.shadow,
  ]);
  const violations: ScaleViolation[] = [];

  const checkValue = (
    prop: string,
    scale: ScaleName,
    node: ts.Node | undefined,
    validateAllBareWords: boolean,
  ) => {
    if (!node) {
      return;
    }

    for (const literal of getStringLiterals(node)) {
      const value = literal.text;
      const isTokenLike =
        scaleLikeValues.has(value) ||
        (validateAllBareWords && value.length > 1 && /^[a-z_]+$/.test(value));
      if (
        isTokenLike &&
        !RAW_CSS_VALUES.has(value) &&
        !scaleKeys[scale].has(value)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          literal.getStart(sourceFile),
        );
        violations.push({ file, line: line + 1, prop, scale, value });
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node)) {
      const prop = getPropertyName(node.name);
      const scale = prop ? PROP_TO_SCALE[prop] : undefined;
      const valueNode = !node.initializer
        ? undefined
        : ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : node.initializer;
      if (prop && scale) {
        checkValue(prop, scale, valueNode, true);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const prop = getPropertyName(node.name);
      const scale = prop ? PROP_TO_SCALE[prop] : undefined;
      if (prop && scale) {
        checkValue(prop, scale, node.initializer, false);
      }
    }

    node.forEachChild(visit);
  };

  visit(sourceFile);
  return violations;
};

const getScaleKeys = (): Record<ScaleName, ReadonlySet<string>> => {
  const theme = getThemeOverrides();
  return {
    spacing: new Set(Object.keys(theme.spacing ?? {})),
    radius: new Set(Object.keys(theme.radius ?? {})),
    // Mantine merges theme.shadows with its defaults at runtime, so the
    // stock `md`, `lg`, and `xl` elevations stay usable alongside the new
    // scale. `xs` and `sm` are overridden by the new values.
    shadow: new Set([...Object.keys(theme.shadows ?? {}), "md", "lg", "xl"]),
  };
};

describe("theme scale token audit", () => {
  it("detects invalid scale keys in JSX and responsive objects", () => {
    const violations = findScaleViolationsInSource(
      "fixture.tsx",
      '<Paper shadow="lg" pr={{ sm: "sm", lg: "xs_outline" }} /><Paper shadow="lgg" />',
      getScaleKeys(),
    );

    expect(violations).toEqual([
      {
        file: "fixture.tsx",
        line: 1,
        prop: "pr",
        scale: "spacing",
        value: "xs_outline",
      },
      {
        file: "fixture.tsx",
        line: 1,
        prop: "shadow",
        scale: "shadow",
        value: "lgg",
      },
    ]);
  });

  it("uses only defined scale keys in application style props", () => {
    const files = glob
      .sync("{frontend/src,enterprise/frontend/src}/**/*.{ts,tsx}")
      .filter((file) => !/\.(unit\.spec|spec|test)\.(ts|tsx)$/.test(file));
    const scaleKeys = getScaleKeys();
    const violations = files.flatMap((file) =>
      findScaleViolationsInSource(file, readFileSync(file, "utf8"), scaleKeys),
    );

    expect(violations).toEqual([]);
  });
});
