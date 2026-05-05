import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("AddDataModal (Unactivated enterprise binary)", () => {
  describe("Google Sheets panel", () => {
    it("should not exist on self-hosted instances", async () => {
      setup({ isHosted: false });

      expect(
        screen.getByRole("tab", { name: /Database$/ }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("tab", { name: /CSV$/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: /Google Sheets$/ }),
      ).not.toBeInTheDocument();
    });
  });
});
