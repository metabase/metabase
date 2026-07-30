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
