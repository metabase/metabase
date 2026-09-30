import fs from "fs";
import path from "path";

import ts from "typescript";

import { reinitialize } from "metabase/plugins";

import pluginFeatures from "./plugin-features.json";
import { initializePluginsSync } from "./plugins";

type GatedPluginName = keyof typeof pluginFeatures;

// `Object.keys` widens to `string[]`, and these keys come from the JSON itself.
const GATED_PLUGIN_NAMES = Object.keys(pluginFeatures) as GatedPluginName[];

function readPluginSource(name: string) {
  const file = ["index.ts", "index.tsx"]
    .map((index) => path.join(__dirname, name, index))
    .find((candidate) => fs.existsSync(candidate));
  if (!file) {
    throw new Error(`No index module for the ${name} plugin`);
  }
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function findFeatureChecks(node: ts.Node) {
  const features: string[] = [];
  const visit = (child: ts.Node) => {
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === "hasPremiumFeature" &&
      child.arguments[0] &&
      ts.isStringLiteral(child.arguments[0])
    ) {
      features.push(child.arguments[0].text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return features;
}

function hasNegatedFeatureCheck(node: ts.Node): boolean {
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken &&
    findFeatureChecks(node.operand).length > 0
  ) {
    return true;
  }
  return ts.forEachChild(node, hasNegatedFeatureCheck) ?? false;
}

/**
 * What a plugin would lose by not loading on an instance without its
 * features: any work its module does as it is evaluated, and any work
 * `initializePlugin` does outside a check for one of its features.
 */
function describePlugin(name: string) {
  const source = readPluginSource(name);
  const problems: string[] = [];
  const features = new Set<string>();

  for (const statement of source.statements) {
    if (ts.isExpressionStatement(statement)) {
      problems.push(`runs at import: ${statement.getText(source)}`);
    }
  }

  const initializer = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "initializePlugin",
  );
  for (const statement of initializer?.body?.statements ?? []) {
    const checks = ts.isIfStatement(statement)
      ? findFeatureChecks(statement.expression)
      : [];
    if (
      !ts.isIfStatement(statement) ||
      statement.elseStatement ||
      checks.length === 0 ||
      hasNegatedFeatureCheck(statement.expression)
    ) {
      problems.push(`runs whatever the token: ${statement.getText(source)}`);
    }
    checks.forEach((feature) => features.add(feature));
  }

  return { features: [...features].sort(), problems };
}

describe("enterprise plugins", () => {
  afterEach(() => {
    reinitialize();
  });

  it.each(GATED_PLUGIN_NAMES)(
    "%s only does work behind the features it loads for",
    (name) => {
      const { features, problems } = describePlugin(name);

      expect(problems).toEqual([]);
      expect(features).toEqual([...pluginFeatures[name]].sort());
    },
  );

  it("initializes every plugin that loads on demand exactly once", () => {
    const initialized: string[] = [];

    initializePluginsSync((name) => ({
      initializePlugin: () => initialized.push(name),
    }));

    expect(initialized.sort()).toEqual([...GATED_PLUGIN_NAMES].sort());
  });
});
