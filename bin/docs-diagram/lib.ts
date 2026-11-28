// Draws and renders the diagrams in docs/. See .claude/skills/docs-diagram/SKILL.md.
// The PNGs don't follow the app's theme, so they can't use its colors.
/* eslint-disable no-console, metabase/no-color-literals */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const CANVAS_WIDTH = 980;
const PREVIEW_WIDTH = 750;
const TITLE_HEIGHT = 44;
const BOTTOM_MARGIN = 36;
const EDGE_MARGIN = 24;

const HALF_TILE = 32;
const TILE_TITLE_OFFSET = 26;
const SUBLABEL_HEIGHT = 19;

const CHIP_HEIGHT = 22;
const CHIP_PADDING = 8;
const CHIP_CLEARANCE = 8;

// Arrowheads stop short of the tile's border, so the tip reads cleanly.
const ARROW_GAP = 1;

/** The radius of a connector's corners, which is also the room that a branch needs to turn. */
export const CORNER_RADIUS = 16;

const BLUE = "#509ee3";
const GRAY_TEXT = "#8d93a5";
const GRAY_LINE = "#c6c9d2";
const TITLE_COLOR = "#5a6072";
const RED = "#e84a4a";
const RED_FILL = "#fce8e8";

type Point = readonly [x: number, y: number];
type Direction = readonly [dx: number, dy: number];
type Segment = readonly [start: Point, end: Point];
type Route = readonly [Point, Point, ...Point[]];

interface Bounds {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** A box, and what to call it when it has a problem. */
interface NamedBox extends Bounds {
  name: string;
}

interface TileColors {
  fill: string;
  border: string;
  icon: string;
  iconFill: string;
  text: string;
}

interface LineStyle {
  color: string;
  dash?: string;
}

interface TextStyle {
  size: number;
  letterSpacing: number;
  weight: number;
}

interface TextLine {
  text: string;
  x: number;
  baseline: number;
  style: TextStyle;
  color: string;
}

export interface Tile {
  kind: "tile";
  x: number;
  y: number;
  box: NamedBox;
  labelBoxes: readonly NamedBox[];
  bottom: number;
  svg: string;
}

interface Connector {
  kind: "connector";
  layer: "connector" | "mainConnector";
  segments: readonly Segment[];
  svg: string;
}

interface Chip {
  kind: "chip";
  x: number;
  y: number;
  box: NamedBox;
  svg: string;
}

interface Marker {
  kind: "marker";
  svg: string;
}

export type Part = Tile | Connector | Chip | Marker;

const TILE_STYLES = {
  main: {
    fill: "#eef6fc",
    border: BLUE,
    icon: BLUE,
    iconFill: "#e4ecfb",
    text: BLUE,
  },
  quiet: {
    fill: "#f7f7f8",
    border: GRAY_LINE,
    icon: "#a5a9b7",
    iconFill: "#f1f2f4",
    text: GRAY_TEXT,
  },
} satisfies Record<string, TileColors>;

const LINE_STYLES = {
  main: { color: BLUE },
  quiet: { color: GRAY_LINE },
  dashed: { color: GRAY_LINE, dash: "6 6" },
} satisfies Record<string, LineStyle>;

const FONT = "'Roboto Mono', monospace";
const LABEL: TextStyle = { size: 14, letterSpacing: 1, weight: 700 };
const SMALL: TextStyle = { size: 12, letterSpacing: 0.8, weight: 500 };

// Every character in Roboto Mono is 0.6em wide.
const textWidth = (text: string, style: TextStyle) =>
  text.length * (style.size * 0.6 + style.letterSpacing);

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const textElement = ({
  text,
  x,
  baseline,
  style,
  color,
  anchor = "middle",
}: TextLine & { anchor?: "start" | "middle" }) =>
  `<text x="${x}" y="${baseline}" text-anchor="${anchor}" font-family="${FONT}" font-size="${style.size}" font-weight="${style.weight}" letter-spacing="${style.letterSpacing}" fill="${color}">${escapeXml(text)}</text>`;

const textBox = ({ text, x, baseline, style }: TextLine): NamedBox => {
  const halfWidth = textWidth(text, style) / 2;
  return {
    name: text,
    x1: x - halfWidth,
    x2: x + halfWidth,
    y1: baseline - style.size * 0.8,
    y2: baseline + style.size * 0.2,
  };
};

const stroke = (color: string, dash?: string) =>
  `stroke="${color}" stroke-width="1.5" stroke-linecap="${dash ? "butt" : "round"}" stroke-linejoin="round"` +
  (dash ? ` stroke-dasharray="${dash}"` : "");

const linePath = (d: string, color: string, dash?: string) =>
  `<path fill="none" ${stroke(color, dash)} d="${d}"/>`;

const windowFrame = ({ icon, iconFill }: TileColors) =>
  `<rect x="13" y="17" width="38" height="30" rx="5" fill="${iconFill}" ${stroke(icon)}/>`;

// Icons sit in a 64 x 64 tile: 1.5px lines, about 38px across, centered on 32, 32.
const ICONS = {
  terminal: (colors) =>
    windowFrame(colors) + linePath("M21 27l5 5-5 5M30 37h9", colors.icon),

  git: ({ icon, iconFill }) =>
    linePath("M23 22v20M41 26.5V29a6 6 0 0 1-6 6h-6a6 6 0 0 0-6 6", icon) +
    [
      [23, 17.5],
      [23, 46.5],
      [41, 22],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${x}" cy="${y}" r="4.5" fill="${iconFill}" ${stroke(icon)}/>`,
      )
      .join(""),

  // A browser window with a small bar chart.
  app: (colors) =>
    windowFrame(colors) +
    linePath("M13 25h38M24 41v-5M32 41v-10M40 41v-7", colors.icon),

  // A browser window with a frame in the page.
  page: (colors) =>
    windowFrame(colors) +
    linePath("M13 25h38", colors.icon) +
    `<rect x="20" y="30" width="24" height="11" rx="2" fill="#fff" ${stroke(colors.icon)}/>`,

  code: ({ icon }) =>
    linePath("M25 24l-8 8 8 8M39 24l8 8-8 8M35 21l-6 22", icon),

  person: ({ icon, iconFill }) =>
    `<path transform="translate(-414.52 -267)" fill="${iconFill}" ${stroke(icon)} d="M455.188 288.333a8.667 8.667 0 1 1-17.334 0 8.667 8.667 0 0 1 17.334 0M432.78 318.333h27.48c3.046 0 5.391-2.618 3.969-5.311-2.092-3.961-6.861-8.689-17.709-8.689s-15.616 4.728-17.708 8.689c-1.422 2.693.923 5.311 3.968 5.311"/>`,
} satisfies Record<string, (colors: TileColors) => string>;

type IconName = keyof typeof ICONS | "metabase";

// The dots of the Metabase logo: x, y, and whether the dot is solid.
const LOGO_DOTS: readonly (readonly [x: number, y: number, solid: boolean])[] =
  [
    [10.576, 13.991, true],
    [10.576, 21.319, true],
    [17.788, 13.991, false],
    [17.788, 21.39, true],
    [25, 13.991, false],
    [25, 5.617, false],
    [25, 21.39, false],
    [32.212, 13.991, false],
    [39.424, 13.991, true],
    [32.212, 21.39, true],
    [39.424, 21.39, true],
    [10.576, 28.646, true],
    [17.788, 28.717, false],
    [25, 28.717, true],
    [32.212, 28.717, false],
    [39.424, 28.717, true],
    [10.576, 35.973, true],
    [17.788, 36.044, false],
    [25, 36.044, false],
    [25, 43.372, false],
    [32.212, 36.044, false],
    [39.424, 36.044, true],
  ];

const METABASE_LOGO = LOGO_DOTS.map(
  ([x, y, solid]) =>
    `<ellipse cx="${x}" cy="${y}" rx="2.576" ry="2.617" fill="${BLUE}"${solid ? "" : ' opacity=".2"'}/>`,
).join("");

const SHADOW =
  '<defs><filter id="tile-shadow" filterUnits="objectBoundingBox" x="-32%" y="-1%" width="164%" height="164%" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/><feMorphology in="SourceAlpha" radius="4" result="effect1"/><feOffset dy="8"/><feGaussianBlur stdDeviation="4"/><feColorMatrix values="0 0 0 0 0.0627451 0 0 0 0 0.0941176 0 0 0 0 0.156863 0 0 0 0.03 0"/><feBlend in2="BackgroundImageFix" result="effect1"/><feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/><feMorphology in="SourceAlpha" radius="4" result="effect2"/><feOffset dy="20"/><feGaussianBlur stdDeviation="12"/><feColorMatrix values="0 0 0 0 0.0627451 0 0 0 0 0.0941176 0 0 0 0 0.156863 0 0 0 0.08 0"/><feBlend in2="effect1" result="effect2"/><feBlend in="SourceGraphic" in2="effect2" result="shape"/></filter></defs>';

const tileRect = (fill: string, border: string) =>
  `<rect x=".5" y=".5" width="63" height="63" rx="11.5" fill="${fill}" stroke="${border}"/>`;

const tileBody = (icon: IconName, colors: TileColors) =>
  icon === "metabase"
    ? `<g filter="url(#tile-shadow)">${tileRect("#fff", GRAY_TEXT)}<g transform="translate(7 7)">${METABASE_LOGO}</g></g>`
    : tileRect(colors.fill, colors.border) + ICONS[icon](colors);

/**
 * A 64 x 64 tile centered on x, y, with its labels below.
 * The "metabase" icon is the logo, on a white tile in either style.
 */
export function tile(
  x: number,
  y: number,
  icon: IconName,
  title: string,
  {
    sublabels = [],
    style = "main",
  }: {
    sublabels?: readonly string[];
    style?: keyof typeof TILE_STYLES;
  } = {},
): Tile {
  const colors = TILE_STYLES[style];
  const titleBaseline = y + HALF_TILE + TILE_TITLE_OFFSET;
  const labels: TextLine[] = [
    {
      text: title,
      x,
      baseline: titleBaseline,
      style: LABEL,
      color: colors.text,
    },
    ...sublabels.map((text, index) => ({
      text,
      x,
      baseline: titleBaseline + SUBLABEL_HEIGHT * (index + 1),
      style: SMALL,
      color: GRAY_TEXT,
    })),
  ];

  return {
    kind: "tile",
    x,
    y,
    box: {
      name: `the ${title} tile`,
      x1: x - HALF_TILE,
      x2: x + HALF_TILE,
      y1: y - HALF_TILE,
      y2: y + HALF_TILE,
    },
    labelBoxes: labels.map(textBox),
    bottom: titleBaseline + SUBLABEL_HEIGHT * sublabels.length,
    svg:
      `<g transform="translate(${x - HALF_TILE} ${y - HALF_TILE})">${tileBody(icon, colors)}</g>` +
      labels.map(textElement).join(""),
  };
}

// The middle of each edge of a tile, for the ends of connectors.
export const left = ({ x, y }: Tile): Point => [x - HALF_TILE, y];
export const right = ({ x, y }: Tile): Point => [x + HALF_TILE, y];
export const top = ({ x, y }: Tile): Point => [x, y - HALF_TILE];

const direction = ([[x1, y1], [x2, y2]]: Segment): Direction => {
  if (x1 !== x2 && y1 !== y2) {
    throw new Error(`Connectors are orthogonal: ${x1},${y1} to ${x2},${y2}`);
  }
  return [Math.sign(x2 - x1), Math.sign(y2 - y1)];
};

const reverse = ([dx, dy]: Direction): Direction => [-dx, -dy];

const move = ([x, y]: Point, [dx, dy]: Direction, distance: number): Point => [
  x + dx * distance,
  y + dy * distance,
];

const chevron = (tip: Point, [dx, dy]: Direction) => {
  const base = move(tip, [dx, dy], -6);
  const [x1, y1] = move(base, [-dy, dx], 4);
  const [x2, y2] = move(base, [-dy, dx], -4);
  return `M${x1} ${y1}L${tip[0]} ${tip[1]}L${x2} ${y2}`;
};

const roundedCorner = (point: Point, into: Direction, out: Direction) => {
  const [x1, y1] = move(point, into, -CORNER_RADIUS);
  const [x2, y2] = move(point, out, CORNER_RADIUS);
  const sweep = into[0] * out[1] - into[1] * out[0] > 0 ? 1 : 0;
  return `L${x1} ${y1}A${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 ${sweep} ${x2} ${y2}`;
};

/** A line through the points, with rounded corners. */
export function connect(
  points: Route,
  {
    style = "main",
    arrows = "end",
  }: {
    style?: keyof typeof LINE_STYLES;
    arrows?: "end" | "start" | "both" | "none";
  } = {},
): Connector {
  const { color, dash }: LineStyle = LINE_STYLES[style];
  const segments = points
    .slice(1)
    .map((end, index): Segment => [points[index], end]);
  const directions = segments.map(direction);

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const firstDirection = directions[0];
  const lastDirection = directions[directions.length - 1];

  const hasStartArrow = arrows === "start" || arrows === "both";
  const hasEndArrow = arrows === "end" || arrows === "both";
  const start = hasStartArrow
    ? move(firstPoint, firstDirection, ARROW_GAP)
    : firstPoint;
  const end = hasEndArrow
    ? move(lastPoint, lastDirection, -ARROW_GAP)
    : lastPoint;

  const corners = points
    .slice(1, -1)
    .map((point, index) =>
      roundedCorner(point, directions[index], directions[index + 1]),
    );
  const line = `M${start[0]} ${start[1]}${corners.join("")}L${end[0]} ${end[1]}`;
  const arrowheads = [
    ...(hasStartArrow ? [chevron(start, reverse(firstDirection))] : []),
    ...(hasEndArrow ? [chevron(end, lastDirection)] : []),
  ];

  return {
    kind: "connector",
    layer: style === "main" ? "mainConnector" : "connector",
    segments,
    svg:
      linePath(line, color, dash) +
      arrowheads.map((arrowhead) => linePath(arrowhead, color)).join(""),
  };
}

/** A label on a connector, centered on x, y. */
export function chip(x: number, y: number, text: string): Chip {
  const width = textWidth(text, SMALL) + 2 * CHIP_PADDING;
  const box = {
    name: text,
    x1: x - width / 2,
    x2: x + width / 2,
    y1: y - CHIP_HEIGHT / 2,
    y2: y + CHIP_HEIGHT / 2,
  };

  return {
    kind: "chip",
    x,
    y,
    box,
    svg:
      `<rect x="${box.x1.toFixed(1)}" y="${box.y1}" width="${width.toFixed(1)}" height="${CHIP_HEIGHT}" fill="#fff"/>` +
      textElement({
        text,
        x,
        baseline: y + 4.2,
        style: SMALL,
        color: GRAY_TEXT,
      }),
  };
}

/** A red X, for a route that Metabase blocks. */
export const blocked = (x: number, y: number): Marker => ({
  kind: "marker",
  svg:
    `<circle cx="${x}" cy="${y}" r="11" fill="${RED_FILL}" stroke="${RED}" stroke-width="1.5"/>` +
    linePath(`M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8`, RED),
});

// Boxes that only touch don't overlap, since a connector ends on the border of its tile.
const overlaps = (a: Bounds, b: Bounds) =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

const contains = (outer: Bounds, inner: Bounds) =>
  outer.x1 <= inner.x1 &&
  inner.x2 <= outer.x2 &&
  outer.y1 <= inner.y1 &&
  inner.y2 <= outer.y2;

const segmentBounds = ([[x1, y1], [x2, y2]]: Segment): Bounds => ({
  x1: Math.min(x1, x2),
  x2: Math.max(x1, x2),
  y1: Math.min(y1, y2),
  y2: Math.max(y1, y2),
});

/** Whether the segment shows on both sides of the chip, and runs behind its center. */
const runsBehind = ({ x, y, box }: Chip, segment: Segment) => {
  const line = segmentBounds(segment);
  const acrossChip: Bounds = {
    x1: box.x1 - CHIP_CLEARANCE,
    x2: box.x2 + CHIP_CLEARANCE,
    y1: y,
    y2: y,
  };
  const downChip: Bounds = {
    x1: x,
    x2: x,
    y1: box.y1 - CHIP_CLEARANCE,
    y2: box.y2 + CHIP_CLEARANCE,
  };
  return contains(line, acrossChip) || contains(line, downChip);
};

const edgeProblems = (labels: readonly NamedBox[], canvasHeight: number) => {
  // Parts are placed below the title band.
  const area: Bounds = {
    x1: EDGE_MARGIN,
    x2: CANVAS_WIDTH - EDGE_MARGIN,
    y1: 0,
    y2: canvasHeight - TITLE_HEIGHT - EDGE_MARGIN,
  };
  return labels
    .filter((label) => !contains(area, label))
    .map(({ name }) => `"${name}" is too close to the edge of the canvas.`);
};

const overlapProblems = (boxes: readonly NamedBox[]) =>
  boxes.flatMap((a, index) =>
    boxes
      .slice(index + 1)
      .filter((b) => overlaps(a, b))
      .map((b) => `"${a.name}" overlaps "${b.name}".`),
  );

const connectorProblems = (
  segments: readonly Segment[],
  obstacles: readonly NamedBox[],
) =>
  segments
    .map(segmentBounds)
    .flatMap((line) =>
      obstacles
        .filter((obstacle) => overlaps(line, obstacle))
        .map(({ name }) => `A connector runs through "${name}".`),
    );

const chipProblems = (chips: readonly Chip[], segments: readonly Segment[]) =>
  chips
    .filter((label) => !segments.some((segment) => runsBehind(label, segment)))
    .map(
      ({ box }) =>
        `"${box.name}" needs a connector under it, with at least ${CHIP_CLEARANCE}px showing on each side.`,
    );

/** Problems that are hard to see in a picture. */
function findProblems(parts: readonly Part[], canvasHeight: number) {
  const tiles = parts.filter((part) => part.kind === "tile");
  const chips = parts.filter((part) => part.kind === "chip");
  const segments = parts
    .filter((part) => part.kind === "connector")
    .flatMap((connector) => connector.segments);

  const tileBoxes = tiles.map(({ box }) => box);
  const tileLabels = tiles.flatMap(({ labelBoxes }) => labelBoxes);
  const labels = [...tileLabels, ...chips.map(({ box }) => box)];

  return [
    ...edgeProblems(labels, canvasHeight),
    ...overlapProblems([...labels, ...tileBoxes]),
    ...connectorProblems(segments, [...tileLabels, ...tileBoxes]),
    ...chipProblems(chips, segments),
  ];
}

// The order of the parts doesn't matter: the main route goes on top of the other lines.
const LAYERS = [
  "connector",
  "mainConnector",
  "chip",
  "marker",
  "tile",
] as const;

const layerOf = (part: Part): (typeof LAYERS)[number] =>
  part.kind === "connector" ? part.layer : part.kind;

function pageHtml(title: string, parts: readonly Part[], height: number) {
  const titleElement = textElement({
    text: title,
    x: 42,
    baseline: 48,
    style: LABEL,
    color: TITLE_COLOR,
    anchor: "start",
  });
  const body = LAYERS.flatMap((layer) =>
    parts.filter((part) => layerOf(part) === layer),
  )
    .map(({ svg }) => svg)
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@500;700&display=block">
<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}svg{display:block}</style>
</head><body><svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${height}" fill="none" viewBox="0 0 ${CANVAS_WIDTH} ${height}">${SHADOW}${titleElement}<g transform="translate(0 ${TITLE_HEIGHT})">${body}</g></svg>
<script>
Promise.all(["500 12px 'Roboto Mono'", "700 14px 'Roboto Mono'"].map((font) => document.fonts.load(font)))
  .then((fonts) => { document.body.dataset.fonts = fonts.every((faces) => faces.length > 0) ? "loaded" : "missing"; });
</script></body></html>
`;
}

function findChrome() {
  const candidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const chrome = candidates.find((file) => file && existsSync(file));
  if (!chrome) {
    throw new Error("Chrome not found. Set CHROME to the path of its binary.");
  }
  return chrome;
}

interface Screenshot {
  file: string;
  scale: number;
}

function takeScreenshots(
  html: string,
  height: number,
  screenshots: readonly Screenshot[],
) {
  const chrome = findChrome();
  const workFolder = mkdtempSync(path.join(tmpdir(), "docs-diagram-"));
  const page = path.join(workFolder, "diagram.html");
  const runChrome = (...args: string[]) =>
    execFileSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--virtual-time-budget=8000",
        `--user-data-dir=${path.join(workFolder, "profile")}`,
        ...args,
        pathToFileURL(page).href,
      ],
      { encoding: "utf8", stdio: "pipe" },
    );

  try {
    writeFileSync(page, html);
    if (!runChrome("--dump-dom").includes('data-fonts="loaded"')) {
      throw new Error("Roboto Mono didn't load from fonts.googleapis.com.");
    }
    for (const { file, scale } of screenshots) {
      const temporary = path.join(workFolder, path.basename(file));
      runChrome(
        `--force-device-scale-factor=${scale}`,
        `--window-size=${CANVAS_WIDTH},${height}`,
        `--screenshot=${temporary}`,
      );
      copyFileSync(temporary, file);
    }
  } finally {
    rmSync(workFolder, { recursive: true, force: true, maxRetries: 5 });
  }
}

function outputPaths(out: string) {
  const folder = process.argv[2];
  const name = path.basename(out, ".png");
  const previewName = `${name}-${PREVIEW_WIDTH}.png`;

  return folder
    ? {
        png: path.resolve(folder, `${name}.png`),
        preview: path.resolve(folder, previewName),
      }
    : {
        png: path.join(REPO_ROOT, out),
        preview: path.join(tmpdir(), "docs-diagrams", previewName),
      };
}

/**
 * Renders the parts to a PNG, at 2x. To leave the PNG in docs/ alone, pass a folder:
 * bun docs/data-apps/images/data-app-flow.diagram.ts /tmp/docs-diagrams
 */
export function render({
  out,
  title,
  parts,
}: {
  /** The path of the PNG, from the root of the repo. */
  out: string;
  title: string;
  parts: readonly Part[];
}) {
  const tiles = parts.filter((part) => part.kind === "tile");
  const height =
    TITLE_HEIGHT +
    Math.max(...tiles.map(({ bottom }) => bottom)) +
    BOTTOM_MARGIN;
  const problems = findProblems(parts, height);
  const { png, preview } = outputPaths(out);

  const isClean = problems.length === 0;

  // A diagram with problems gets only a preview, so a failed run leaves the PNG as it was.
  mkdirSync(path.dirname(preview), { recursive: true });
  takeScreenshots(pageHtml(title, parts, height), height, [
    ...(isClean ? [{ file: png, scale: 2 }] : []),
    { file: preview, scale: PREVIEW_WIDTH / CANVAS_WIDTH },
  ]);

  if (isClean) {
    console.log(`Wrote ${png}\nPreview at docs width: ${preview}`);
  } else {
    console.log(`Didn't write ${png}\nPreview at docs width: ${preview}`);
    console.error(problems.map((problem) => `Problem: ${problem}`).join("\n"));
    process.exitCode = 1;
  }
}
