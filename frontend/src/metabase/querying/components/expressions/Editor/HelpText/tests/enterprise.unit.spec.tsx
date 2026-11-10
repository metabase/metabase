import { screen } from "@testing-library/react";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

async function setup(opts: SetupOpts) {
  await baseSetup({ ...opts });
}

describe("ExpressionEditorHelpText (EE without token)", () => {
  describe("Metabase links", () => {
    it("should show a help link when `show-metabase-links: true`", async () => {
      await setup({
        enclosingFunction: { name: "concat" },
        showMetabaseLinks: true,
      });

      expect(screen.getByRole("link", { name: "Docs" })).toBeInTheDocument();
    });

    it("should show a help link when `show-metabase-links: false`", async () => {
      await setup({
        enclosingFunction: { name: "concat" },
        showMetabaseLinks: false,
      });

      expect(screen.getByRole("link", { name: "Docs" })).toBeInTheDocument();
    });
  });
});
