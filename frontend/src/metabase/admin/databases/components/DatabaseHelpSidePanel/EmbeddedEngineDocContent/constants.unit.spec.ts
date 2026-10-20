import { existsSync } from "fs";

import { ENGINE_DOC_MAP } from "./constants";

describe("ENGINE_DOC_MAP", () => {
  it.each(Object.entries(ENGINE_DOC_MAP))(
    "points %s to a doc file that exists",
    (_engineKey, docFileName) => {
      expect(existsSync(`docs/databases/connections/${docFileName}.md`)).toBe(
        true,
      );
    },
  );
});
