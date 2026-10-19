// Appends the weekly @emotion/* importer count to the "Emotion Files" table in
// eng-stats-importer. Reads EMOTION_FILES and API_KEY from env.

import { importStats } from "./stats-import";

async function main() {
  console.log("EMOTION_FILES", Number(process.env.EMOTION_FILES));

  // Keys must match the target table's columns (the importer normalizes both
  // sides, so casing/spacing is forgiving).
  const rows = [
    {
      Date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
      "Emotion Files": Number(process.env.EMOTION_FILES),
    },
  ];

  await importStats({ table: "emotion_stats", rows });
  console.log("Data uploaded successfully");
}

main().catch((error) => {
  console.error("Error uploading data:", error);
  process.exit(1);
});
