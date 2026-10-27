import fs from "node:fs";
import path from "node:path";

import { createPool } from "../../frontend/test/harness/pool.ts";

const root = process.cwd();
const files = fs
  .readFileSync(process.argv[2], "utf8")
  .split("\n")
  .filter(Boolean)
  .map((file) => path.join(root, file));
const pool = createPool({
  workers: 1,
  onFileDone: ({ file, result }) => {
    const name = path.relative(root, file);
    console.log(
      `SEQ ${result.failed ? "FAIL" : "pass"} ${name}`,
      result.failures
        .map((failure) => `\nSEQ    ${failure.test}: ${failure.message.split("\n").find((line) => /An update to/.test(line)) ?? failure.message.split("\n")[0]}`)
        .join(""),
    );
  },
});
await pool.run(files);
pool.close();
