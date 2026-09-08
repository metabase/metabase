// Appends the measured retention to the "Bundle Memory" table in
// eng-stats-importer. Reads MEMORY (the JSON memory.js prints) and API_KEY from
// env, and stamps the row with the commit it came from.

import { readFileSync } from "node:fs";

import { importStats } from "./stats-import";

interface Retention {
  laps: number;
  nodes: number[];
  listeners: number[];
  nodesPerLap: number;
  listenersPerLap: number;
}

async function main() {
  const path = process.env.MEMORY || "artifacts/memory.json";
  // memory.js wrote this file, and Retention is the shape it prints.
  const retention = JSON.parse(readFileSync(path, "utf8")) as Retention;

  const rows = [
    {
      Date: new Date().toISOString().slice(0, 10),
      Commit: process.env.HEAD_SHA || "",
      "Commit message": (process.env.COMMIT_MESSAGE || "").split("\n")[0],
      Laps: retention.laps,
      // The slope is the number to watch. The first and last readings are kept
      // so a run can be read without recomputing it.
      "Nodes per lap": retention.nodesPerLap,
      "Listeners per lap": retention.listenersPerLap,
      "First lap nodes": retention.nodes[0],
      "Last lap nodes": retention.nodes[retention.nodes.length - 1],
      "First lap listeners": retention.listeners[0],
      "Last lap listeners": retention.listeners[retention.listeners.length - 1],
    },
  ];

  console.table(rows);

  try {
    await importStats({ table: "bundle_memory", rows });
    console.log("Retention uploaded successfully");
  } catch (error) {
    // Stats logging is best-effort. A point lost to an unreachable importer is
    // worth less than a red build on master, and the next commit plots another.
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      `::warning::Retention upload failed after retries; leaving run green: ${message}`,
    );
  }
}

main();
