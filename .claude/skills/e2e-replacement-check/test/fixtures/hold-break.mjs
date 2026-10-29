import fs from "node:fs";

import { createGuard, installInterruptHandlers } from "../../lib/guard.mjs";

const [root, stateDir, file] = process.argv.slice(2);
const guard = createGuard({ root, stateDir });
installInterruptHandlers(guard, { log: () => {} });
const before = fs.readFileSync(`${root}/${file}`, "utf8");
guard.apply([{ file, after: before.replace("original", "broken") }]);
process.stdout.write("applied\n");
setInterval(() => {}, 1000);
