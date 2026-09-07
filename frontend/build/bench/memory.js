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

if (!site) {
  console.error("usage: node memory.js <site> [laps]");
  console.error("env: SESSION_COOKIE PORT_OFFSET");
  process.exit(1);
}

/**
 * One pass over the app.
 *
 * Breadth is the point. A lap that only opened a dashboard could only ever
 * catch a dashboard leak, so this covers the surfaces that mount the most:
 * charts, both query editors, tables and an admin screen. When a count climbs,
 * bisect by trimming the list.
 */
const LAP = [
  { name: "home", path: "/" },
  { name: "dashboard", path: "/dashboard/1" },
  { name: "question", path: "/question/1" },
  { name: "native editor", path: "/question/notebook#" },
  { name: "browse databases", path: "/browse/databases" },
  { name: "collection", path: "/collection/root" },
  { name: "admin people", path: "/admin/people" },
  { name: "admin databases", path: "/admin/databases" },
];

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

  // One real navigation to boot the app. Everything after it goes through the
  // router, in one document, which is where a leak would show.
  await visit(session, LAP[0].path, { reload: true });

  for (let lap = 0; lap < laps; lap++) {
    for (const step of LAP) {
      await visit(session, step.path);
    }

    const counters = await measure(session);
    readings.push(counters);
    console.log(
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

  console.log("");
  console.log(`nodes per lap:     ${result.nodesPerLap.toFixed(1)}`);
  console.log(`listeners per lap: ${result.listenersPerLap.toFixed(1)}`);
  console.log("");
  console.log(JSON.stringify(result));

  await devtools(port, "/json/close/all").catch(() => {});
  chrome.kill();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
