import fs from "node:fs";
import path from "node:path";

import { ENGINE_DOC_MAP } from "./constants";

// docs/databases/connections lives at the repo root, 8 levels up from this file.
const DOCS_DIR = path.resolve(
  __dirname,
  "../../../../../../../..",
  "docs/databases/connections",
);

describe("ENGINE_DOC_MAP", () => {
  it.each(Object.entries(ENGINE_DOC_MAP))(
    "%s maps to %s.md, which exists in docs/databases/connections",
    (_engineKey, slug) => {
      expect(fs.existsSync(path.join(DOCS_DIR, `${slug}.md`))).toBe(true);
    },
  );
});
