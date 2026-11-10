// Appends the weekly count of files disabling a no-unsafe-* lint rule to the
// "No Unsafe Disable Stats" table in eng-stats-importer. Reads
// NO_UNSAFE_DISABLE_FILES and API_KEY from env.

import { importStats } from "./stats-import";

async function main() {
  const raw = process.env.NO_UNSAFE_DISABLE_FILES?.trim() ?? "";
  console.log("NO_UNSAFE_DISABLE_FILES", raw);
  // Number() turns "" into 0 and garbage into NaN (uploaded as null), so a
  // broken count step would record a bogus data point instead of failing.
  if (!/^\d+$/.test(raw)) {
    throw new Error(`NO_UNSAFE_DISABLE_FILES is not a count: "${raw}"`);
  }
  const files = Number(raw);

  // Keys must match the target table's columns (the importer normalizes both
  // sides, so casing/spacing is forgiving).
  const rows = [
    {
      Date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
      Files: files,
    },
  ];

  await importStats({ table: "no_unsafe_disable_stats", rows });
  console.log("Data uploaded successfully");
}

main().catch((error) => {
  console.error("Error uploading data:", error);
  process.exit(1);
});
