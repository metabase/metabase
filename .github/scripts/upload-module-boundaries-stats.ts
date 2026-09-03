// Appends the weekly module-boundary counts to the "Module Boundaries" table in
// eng-stats-importer. Reads NAMED_MODULES, ENFORCED_MODULES, UNMODULED,
// VIOLATIONS and API_KEY from env.

import { importStats } from "./stats-import";

async function main() {
  console.log("NAMED_MODULES", Number(process.env.NAMED_MODULES));
  console.log("ENFORCED_MODULES", Number(process.env.ENFORCED_MODULES));
  console.log("UNMODULED", Number(process.env.UNMODULED));
  console.log("VIOLATIONS", Number(process.env.VIOLATIONS));

  const rows = [
    {
      Date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
      Modules: Number(process.env.NAMED_MODULES),
      "Enforced modules": Number(process.env.ENFORCED_MODULES),
      "Unmoduled folders": Number(process.env.UNMODULED),
      Violations: Number(process.env.VIOLATIONS),
    },
  ];

  await importStats({ table: "module_boundaries", rows });
  console.log("Data uploaded successfully");
}

main().catch((error) => {
  console.error("Error uploading data:", error);
  process.exit(1);
});
