/* eslint-env node */
/* eslint-disable no-console -- printing the result is what this script is for */

/**
 * Measures what a session retains after navigating around the app.
 *
 * Jest heap specs can tell you a given cache regressed. They cannot see a
 * detached DOM node, a listener that outlives its component, or a chart
 * instance that was never disposed. Those need a real browser and a real flow.
 *
 * It drives Chrome directly rather than through a test runner. A runner shares
 * the renderer with the page, and Memory.getDOMCounters reports for the whole
 * process, so a runner's own growth lands in the reading. Measured inside
 * Cypress, an identical lap that only ever loaded the home page still climbed
 * from 36,170 to 107,423 nodes, while the app's own document sat at 713 the
 * whole time.
 *
 * The counters are exact. Retaining 500 detached nodes with a listener each
 * moves them by 500 nodes and 499 listeners, every round, so a flat reading
 * means the app released what it allocated rather than that nothing was
 * measured.
 *
 * usage: SESSION_COOKIE=$(node sign-in.js http://localhost:4000) \
 *          node memory.js http://localhost:4000 [laps]
 */

const { devtools, launchChrome, openSession, sleep } = require("./chrome");

const site = (process.argv[2] || "").replace(/\/$/, "");
const laps = Number(process.argv[3] || 6);
const sessionCookie = process.env.SESSION_COOKIE || "";
const port = 9222 + Number(process.env.PORT_OFFSET || 0);
// Comma separated step names, for bisecting a lap that grows.

if (!site) {
  console.error("usage: node memory.js <site> [laps]");
  console.error("env: SESSION_COOKIE PORT_OFFSET");
  process.exit(1);
}

/**
 * Builds the ad-hoc question URL the query builder reads.
 *
 * The bench instance is blank, with no saved questions or dashboards, so the
 * lap cannot visit `/question/1`. An ad-hoc question needs nothing saved and
 * still mounts the whole visualisation stack.
 */
function adHocQuestion(question) {
  const withDisplay = { display: "table", displayIsLocked: true, ...question };
  return `/question#${Buffer.from(JSON.stringify(withDisplay)).toString("base64")}`;
}

async function api(path, body) {
  const response = await fetch(`${site}${path}`, {
    method: body ? (body.__method ?? "POST") : "GET",
    headers: {
      cookie: `metabase.SESSION=${sessionCookie}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify({ ...body, __method: undefined }) : undefined,
  });
  if (!response.ok) {
    throw new Error(
      `${path} failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.json();
}

/** A count broken out by month, which is what most of the charts render. */
function countByMonth(databaseId, tableId, dateFieldId) {
  return {
    type: "query",
    database: databaseId,
    query: {
      "source-table": tableId,
      aggregation: [["count"]],
      breakout: [["field", dateFieldId, { "temporal-unit": "month" }]],
    },
  };
}

/**
 * The visualisations worth walking.
 *
 * Each is a different renderer, so a leak in one does not imply a leak in the
 * others. `LAP_STEPS` narrows the lap to a subset, which is how a climbing
 * count gets pinned to a single display.
 */
const CHART_DISPLAYS = ["line", "bar", "area", "row", "pie", "scalar"];

/**
 * Puts a dashboard and a card per display on a blank instance.
 *
 * The bench instance has no saved content, and a dashboard is the surface that
 * mounts several visualisations at once, so the lap has to create one before it
 * can walk it.
 */
async function seed({ databaseId, tableId, dateFieldId }) {
  const query = countByMonth(databaseId, tableId, dateFieldId);

  const cards = [];
  for (const display of CHART_DISPLAYS) {
    cards.push(
      await api("/api/card", {
        name: `bench ${display}`,
        dataset_query: query,
        display,
        visualization_settings: {},
      }),
    );
  }

  const dashboard = await api("/api/dashboard", { name: "bench dashboard" });
  await api(`/api/dashboard/${dashboard.id}`, {
    __method: "PUT",
    dashcards: cards.map((card, index) => ({
      id: -1 - index,
      card_id: card.id,
      row: Math.floor(index / 2) * 4,
      col: (index % 2) * 9,
      size_x: 9,
      size_y: 4,
      visualization_settings: {},
      parameter_mappings: [],
    })),
  });

  return { dashboardId: dashboard.id, cards };
}

/**
 * One pass over the app.
 *
 * Breadth is the point. A lap that only opened one page could only ever catch a
 * leak on that page, so this walks a dashboard holding every chart type, each
 * visualisation on its own, both query editors, and an admin screen.
 */
async function buildLap() {
  const databases = await api("/api/database");
  const database = (databases.data || databases)[0];
  const { tables } = await api(`/api/database/${database.id}/metadata`);
  const table =
    tables.find((candidate) => candidate.fields?.length) ?? tables[0];
  const dateField = table.fields.find((field) =>
    String(field.effective_type || field.base_type).startsWith("type/Date"),
  );

  if (!dateField) {
    throw new Error(`No date column on ${table.name}, so no chart to render`);
  }

  const { dashboardId, cards } = await seed({
    databaseId: database.id,
    tableId: table.id,
    dateFieldId: dateField.id,
  });

  const query = countByMonth(database.id, table.id, dateField.id);

  return [
    { name: "home", path: "/" },
    // Several visualisations mounting and unmounting together.
    { name: "dashboard", path: `/dashboard/${dashboardId}` },
    // Then each one on its own, so a climb can be pinned to one renderer.
    ...cards.map((card) => ({
      name: card.display,
      path: `/question/${card.id}`,
    })),
    {
      name: "table question",
      path: adHocQuestion({
        dataset_query: {
          type: "query",
          database: database.id,
          query: { "source-table": table.id },
        },
        display: "table",
      }),
    },
    {
      name: "ad-hoc chart",
      path: adHocQuestion({ dataset_query: query, display: "line" }),
    },
    { name: "notebook", path: "/question/notebook#" },
    { name: "browse databases", path: "/browse/databases" },
    { name: "collection", path: "/collection/root" },
    { name: "admin people", path: "/admin/people" },
    { name: "admin databases", path: "/admin/databases" },
  ];
}

/**
 * Waits for the app to settle on the route.
 *
 * React having put something under #root is the one signal every build gives,
 * including one compiled before the app recorded any performance mark. The
 * loading spinner clearing is what says the route has its data.
 */
const PAGE_SETTLED = `(() => {
  const root = document.getElementById("root");
  if (!root || root.children.length === 0) {
    return false;
  }
  return document.querySelectorAll("[data-testid='loading-indicator']").length === 0;
})()`;

/**
 * Moves to a route the way a user does, through the router.
 *
 * A Page.navigate for every step would tear the document down each time, and
 * nothing could accumulate: the first version of this read exactly 4,700 nodes
 * on all six laps because every step started from a fresh document. A leak
 * lives in what client-side routing leaves behind, so only the first step of
 * the run is a real navigation.
 */
async function visit(session, path, { reload = false } = {}) {
  if (reload) {
    await session.send("Page.navigate", { url: `${site}${path}` });
  } else {
    await session.send("Runtime.evaluate", {
      expression: `(() => {
        history.pushState({}, "", ${JSON.stringify(path)});
        window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      })()`,
    });
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    const { result } = await session.send("Runtime.evaluate", {
      expression: PAGE_SETTLED,
    });
    if (result.value) {
      break;
    }
    await sleep(250);
  }

  // Charts and grids render after the data arrives, so give the frame that
  // follows a moment to commit before moving on.
  await sleep(500);
}

/**
 * Collects, then reads the counters.
 *
 * HeapProfiler.collectGarbage rather than an --expose-gc window.gc(): that one
 * is lazy, and after dropping 5,000 nodes it took three cycles for the counts
 * to come back down. The settle is what makes a reading repeatable.
 */
async function measure(session) {
  await session.send("HeapProfiler.collectGarbage");
  await sleep(250);
  return session.send("Memory.getDOMCounters");
}

function growthPerLap(values, warmup = 1) {
  const settled = values.slice(warmup);
  const first = settled[0];
  const last = settled[settled.length - 1];
  return (last - first) / (settled.length - 1);
}

async function main() {
  const chrome = await launchChrome(port);
  const session = await openSession(port);

  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("HeapProfiler.enable");

  if (sessionCookie) {
    const { host } = new URL(site);
    await session.send("Network.enable");
    await session.send("Network.setCookie", {
      name: "metabase.SESSION",
      value: sessionCookie,
      domain: host.split(":")[0],
      path: "/",
    });
  }

  const readings = [];

  const only = (process.env.LAP_STEPS || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const LAP = (await buildLap()).filter(
    (step) => only.length === 0 || only.includes(step.name),
  );
  console.error(`lap: ${LAP.map((step) => step.name).join(" -> ")}`);

  // One real navigation to boot the app. Everything after it goes through the
  // router, in one document, which is where a leak would show.
  await visit(session, LAP[0].path, { reload: true });

  for (let lap = 0; lap < laps; lap++) {
    for (const step of LAP) {
      await visit(session, step.path);
    }

    const counters = await measure(session);
    readings.push(counters);
    console.error(
      `lap ${lap + 1}: ${counters.nodes} nodes, ` +
        `${counters.jsEventListeners} listeners, ${counters.documents} documents`,
    );
  }

  const nodes = readings.map((reading) => reading.nodes);
  const listeners = readings.map((reading) => reading.jsEventListeners);

  // The first lap always allocates: chunks load, caches warm, the app mounts
  // for the first time. The slope over the rest is the number that matters.
  const result = {
    laps,
    nodes,
    listeners,
    nodesPerLap: growthPerLap(nodes),
    listenersPerLap: growthPerLap(listeners),
  };

  console.error(`nodes per lap:     ${result.nodesPerLap.toFixed(1)}`);
  console.error(`listeners per lap: ${result.listenersPerLap.toFixed(1)}`);

  // stdout is the machine-readable half, so the workflow can pipe it.
  console.log(JSON.stringify(result, null, 2));

  await devtools(port, "/json/close/all").catch(() => {});
  chrome.kill();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
