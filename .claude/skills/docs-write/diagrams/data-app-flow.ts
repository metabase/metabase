// How an app gets from an agent to people. Two diagrams share a main row:
// - docs/data-apps/build.md: a development Metabase and a production Metabase
// - docs/data-apps/getting-started.md: one production Metabase
import {
  CORNER_RADIUS,
  type Part,
  type Tile,
  chip,
  connect,
  left,
  render,
  right,
  tile,
  top,
} from "./lib";

const AGENT_X = 112;
const GIT_X = 316;
const METABASE_X = 722;
const PEOPLE_X = 890;
const PREVIEW_Y = 72;

// Where the line to the preview leaves the main row.
const PREVIEW_TRUNK_X = 184;

const preview = tile(GIT_X, PREVIEW_Y, "app", "LOCAL APP PREVIEW", {
  sublabels: ["LOCALHOST"],
  style: "quiet",
});

const mainRow = (y: number) => ({
  agent: tile(AGENT_X, y, "terminal", "AI CODING AGENT", {
    sublabels: ["BUILDS THE APP"],
  }),
  git: tile(GIT_X, y, "git", "GIT REPOSITORY", {
    sublabels: ["KEEPS THE APP"],
  }),
  production: tile(METABASE_X, y, "metabase", "PRODUCTION METABASE", {
    sublabels: ["READ-ONLY MODE", "YOU SET PERMISSIONS"],
  }),
  people: tile(PEOPLE_X, y, "person", "PEOPLE", {
    sublabels: ["OPEN THE APP"],
  }),
});

// The main row, and the loop from the agent through the preview to a Metabase.
function sharedParts(
  { agent, git, production, people }: ReturnType<typeof mainRow>,
  previewMetabase: Tile,
): Part[] {
  const y = agent.y;
  const agentChipX = (PREVIEW_TRUNK_X + CORNER_RADIUS + left(git)[0]) / 2;

  return [
    preview,
    agent,
    git,
    production,
    people,
    connect([right(agent), left(git)]),
    connect([right(git), left(production)]),
    connect([right(production), left(people)]),
    connect(
      [
        [PREVIEW_TRUNK_X - CORNER_RADIUS, y],
        [PREVIEW_TRUNK_X, y],
        [PREVIEW_TRUNK_X, PREVIEW_Y],
        left(preview),
      ],
      { style: "quiet" },
    ),
    connect([right(preview), [METABASE_X, PREVIEW_Y], top(previewMetabase)], {
      style: "quiet",
      arrows: "both",
    }),
    chip(agentChipX, y, "PUSH"),
    chip(agentChipX, PREVIEW_Y, "STARTS"),
    chip((right(git)[0] + METABASE_X) / 2, PREVIEW_Y, "READS AND WRITES DATA"),
  ];
}

function developmentToProduction() {
  const row = mainRow(346);
  const { git, production } = row;
  const development = tile(
    METABASE_X,
    192,
    "metabase",
    "DEVELOPMENT METABASE",
    { sublabels: ["READ-WRITE MODE", "YOU CHECK THE APP"] },
  );
  const metabaseLeft = left(development)[0];
  const pushY = development.y - 16;
  const pullY = development.y + 16;
  const pullTrunkX = 404;

  render({
    out: "docs/data-apps/images/data-app-flow.png",
    title: "DEVELOPMENT TO PRODUCTION WORKFLOW",
    parts: [
      ...sharedParts(row, development),
      development,
      connect([[metabaseLeft, pushY], [GIT_X, pushY], top(git)], {
        style: "dashed",
      }),
      connect([
        [pullTrunkX - CORNER_RADIUS, git.y],
        [pullTrunkX, git.y],
        [pullTrunkX, pullY],
        [metabaseLeft, pullY],
      ]),
      chip(471, pushY, "PUSH TABLES AND METRICS"),
      chip(600, pullY, "1. PULL BRANCH"),
      chip(
        (pullTrunkX + CORNER_RADIUS + left(production)[0]) / 2,
        git.y,
        "2. YOU MERGE, THEN PULL",
      ),
    ],
  });
}

function oneMetabase() {
  const row = mainRow(212);
  const { git, production } = row;

  render({
    out: "docs/data-apps/images/data-app-flow-one-metabase.png",
    title: "SINGLE METABASE WORKFLOW",
    parts: [
      ...sharedParts(row, production),
      chip((right(git)[0] + left(production)[0]) / 2, git.y, "PULL"),
    ],
  });
}

developmentToProduction();
oneMetabase();
