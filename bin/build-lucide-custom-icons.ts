/**
 * Turns the SVG files exported from Figma into Lucide-compatible icon
 * components, so custom icons take the same props as Lucide's (`size`,
 * `strokeWidth`, `absoluteStrokeWidth`, `color`).
 *
 * Input:  one file per icon in CUSTOM_SVG_DIR, named after the Metabase icon
 *         it replaces, e.g. `join_inner.svg`.
 * Output: CUSTOM_ICONS_FILE, regenerated from scratch on every run.
 *
 * Run with `bun run build-lucide-custom-icons`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { XMLParser } from "fast-xml-parser";

const COMPARISON_DIR =
  "frontend/src/metabase/ui/components/icons/Icon/LucideComparison";
const CUSTOM_SVG_DIR = join(COMPARISON_DIR, "custom-svg");
const CUSTOM_ICONS_FILE = join(COMPARISON_DIR, "customIcons.ts");

const EXPECTED_VIEW_BOX = "0 0 24 24";
const EXPECTED_STROKE_WIDTH = "2";

/** The geometry each shape keeps; Lucide supplies every style attribute. */
const GEOMETRY_ATTRIBUTES: Record<string, readonly string[]> = {
  path: ["d"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
};

/** Elements that never draw anything themselves. */
const SKIPPED_ELEMENTS = new Set([
  "defs",
  "title",
  "desc",
  "metadata",
  "mask",
  "clipPath",
]);

const ICON_NAMES_FILE = "frontend/src/metabase-types/api/icon.ts";
const ICON_NAMES = new Set(
  Array.from(
    readFileSync(ICON_NAMES_FILE, "utf8").matchAll(/^\s*\|\s*"([^"]+)"/gm),
    ([, name]) => name,
  ),
);

type Attributes = Record<string, string>;
type IconNode = [tag: string, attributes: Attributes, children?: IconNode[]];
type XmlNode = Record<string, unknown>;

type ConversionResult = {
  name: string;
  nodes: IconNode[];
  warnings: string[];
  errors: string[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  parseAttributeValue: false,
});

const isXmlNode = (value: unknown): value is XmlNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getTagName = (node: XmlNode) =>
  Object.keys(node).find((key) => key !== ":@" && key !== "#text");

const getAttributes = (node: XmlNode): Attributes => {
  const rawAttributes = node[":@"];
  if (!isXmlNode(rawAttributes)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(rawAttributes).map(([key, value]) => [key, String(value)]),
  );
};

const getChildren = (node: XmlNode, tagName: string): XmlNode[] => {
  const children = node[tagName];
  return Array.isArray(children) ? children.filter(isXmlNode) : [];
};

const isFilled = (attributes: Attributes) =>
  attributes.fill != null &&
  attributes.fill !== "none" &&
  attributes.fill !== "transparent";

function convertShape(
  tagName: string,
  attributes: Attributes,
  key: string,
  warnings: string[],
): IconNode {
  const geometry = GEOMETRY_ATTRIBUTES[tagName] ?? [];
  const kept = Object.fromEntries(
    geometry
      .filter((attribute) => attributes[attribute] != null)
      .map((attribute) => [attribute, attributes[attribute]]),
  );

  if (isFilled(attributes) && attributes.stroke != null) {
    warnings.push(
      `<${tagName}> has both a fill and a stroke; the fill is dropped.`,
    );
  }
  if (isFilled(attributes) && attributes.stroke == null) {
    warnings.push(
      `<${tagName}> is a filled shape with no stroke. It will draw as an outline, ` +
        `and strokeWidth will change its weight. If the stroke was outlined in ` +
        `Figma ("Outline stroke"), undo that and export the original line.`,
    );
  }
  const strokeWidth = attributes["stroke-width"];
  if (strokeWidth != null && strokeWidth !== EXPECTED_STROKE_WIDTH) {
    warnings.push(
      `<${tagName}> has stroke-width ${strokeWidth}. Draw at ${EXPECTED_STROKE_WIDTH} px; ` +
        `the strokeWidth prop sets the weight in the app.`,
    );
  }
  if (attributes.transform != null) {
    kept.transform = attributes.transform;
  }

  return [tagName, { ...kept, key }];
}

function convertChildren(
  nodes: XmlNode[],
  keyPrefix: string,
  warnings: string[],
  errors: string[],
): IconNode[] {
  return nodes.flatMap((node, index): IconNode[] => {
    const tagName = getTagName(node);
    if (tagName == null || SKIPPED_ELEMENTS.has(tagName)) {
      return [];
    }
    const attributes = getAttributes(node);
    const key = `${keyPrefix}${index}`;

    if (attributes.mask != null) {
      errors.push(
        `<${tagName}> uses a mask. Figma does this for strokes set to Inside or ` +
          `Outside; set the stroke alignment to Center and export again.`,
      );
      return [];
    }

    if (tagName === "g") {
      const children = convertChildren(
        getChildren(node, tagName),
        `${key}-`,
        warnings,
        errors,
      );
      // Figma wraps every export in a group clipped to the frame; drop it.
      return attributes.transform != null
        ? [["g", { transform: attributes.transform, key }, children]]
        : children;
    }

    if (GEOMETRY_ATTRIBUTES[tagName] == null) {
      warnings.push(`<${tagName}> is not a shape Lucide can draw; skipped.`);
      return [];
    }

    return [convertShape(tagName, attributes, key, warnings)];
  });
}

function convertSvgFile(fileName: string): ConversionResult {
  const name = basename(fileName, ".svg");
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!ICON_NAMES.has(name)) {
    errors.push(
      `"${name}" is not an icon name listed in ${ICON_NAMES_FILE}. Name the ` +
        `file after the icon it replaces, e.g. join_inner.svg.`,
    );
  }

  const document: unknown = parser.parse(
    readFileSync(join(CUSTOM_SVG_DIR, fileName), "utf8"),
  );
  const svgNode = Array.isArray(document)
    ? document.filter(isXmlNode).find((node) => getTagName(node) === "svg")
    : undefined;

  if (svgNode == null) {
    return { name, nodes: [], warnings, errors: ["No <svg> element found."] };
  }

  const viewBox = getAttributes(svgNode).viewBox;
  if (viewBox !== EXPECTED_VIEW_BOX) {
    errors.push(
      `viewBox is "${viewBox ?? "missing"}"; it must be "${EXPECTED_VIEW_BOX}". ` +
        `Draw in a 24 x 24 frame and export the frame, not the shapes.`,
    );
  }

  const nodes = convertChildren(
    getChildren(svgNode, "svg"),
    "",
    warnings,
    errors,
  );
  if (nodes.length === 0) {
    errors.push("No shapes to draw.");
  }

  return { name, nodes, warnings, errors };
}

const formatAttributes = (attributes: Attributes) =>
  `{ ${Object.entries(attributes)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(", ")} }`;

const formatNode = ([tagName, attributes, children]: IconNode): string =>
  children
    ? `[${JSON.stringify(tagName)}, ${formatAttributes(attributes)}, [${children.map(formatNode).join(", ")}]]`
    : `[${JSON.stringify(tagName)}, ${formatAttributes(attributes)}]`;

function renderModule(icons: ConversionResult[]) {
  const entries = icons
    .map(
      ({ name, nodes }) =>
        `  ${JSON.stringify(name)}: /* #__PURE__ */ createLucideIcon(${JSON.stringify(name)}, [${nodes.map(formatNode).join(", ")}]),`,
    )
    .join("\n");

  return `// Generated by bin/build-lucide-custom-icons.ts from the SVG files in
// ./custom-svg. Do not edit by hand: change the SVG and run
// \`bun run build-lucide-custom-icons\`.
import { type LucideIcon, createLucideIcon } from "lucide-react";

import type { IconName } from "metabase-types/api";

export const CUSTOM_ICONS: Partial<Record<IconName, LucideIcon>> = {
${entries}
};
`;
}

const svgFiles = readdirSync(CUSTOM_SVG_DIR)
  .filter((fileName) => fileName.endsWith(".svg"))
  .sort();
const results = svgFiles.map(convertSvgFile);

const print = (line: string) => process.stdout.write(`${line}\n`);

results.forEach(({ name, nodes, warnings, errors }) => {
  const status = errors.length > 0 ? "✗" : "✓";
  print(`${status} ${name} (${nodes.length} shapes)`);
  errors.forEach((message) => print(`    error: ${message}`));
  warnings.forEach((message) => print(`    warning: ${message}`));
});

const failed = results.filter(({ errors }) => errors.length > 0);
const converted = results.filter(({ errors }) => errors.length === 0);

writeFileSync(CUSTOM_ICONS_FILE, renderModule(converted));
spawnSync("bunx", ["oxfmt", "--write", CUSTOM_ICONS_FILE], { stdio: "ignore" });

print(
  `\nWrote ${converted.length} icon(s) to ${CUSTOM_ICONS_FILE}` +
    (failed.length > 0 ? `; ${failed.length} skipped, see errors above.` : "."),
);
if (failed.length > 0) {
  process.exitCode = 1;
}
