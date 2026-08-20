/*
 * Helper to add trailing newlines to OpenAPI spec files.
 * Otherwise they fail our lint validation, and 'redocly' doesn't provide
 * a config for that.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SPEC_DIRECTORY = "frontend/build/openapi/spec";

const relativePaths = await readdir(SPEC_DIRECTORY, { recursive: true });

for (const relativePath of relativePaths) {
  if (!relativePath.endsWith(".json")) {
    continue;
  }

  const filePath = join(SPEC_DIRECTORY, relativePath);
  const contents = await readFile(filePath, "utf8");

  if (!contents.endsWith("\n")) {
    await writeFile(filePath, `${contents}\n`);
  }
}
