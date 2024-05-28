import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("CustomMapFooter (EE without token)", () => {
  describe("admin users", () => {
    it("should show an admin settings link `show-metabase-links: true`", () => {
      setup({ isAdmin: true, showMetabaseLinks: true });

      const customMapOption = screen.getByRole("link", {
        name: "Custom map",
      });
      expect(customMapOption).toBeInTheDocument();
      expect(customMapOption).toHaveProperty(
        "href",
        "http://localhost/admin/settings/maps",
      );
    });

    it("should show an admin settings link `show-metabase-links: false`", () => {
      setup({ isAdmin: true, showMetabaseLinks: false });

      const customMapOption = screen.getByRole("link", {
        name: "Custom map",
      });
      expect(customMapOption).toBeInTheDocument();
      expect(customMapOption).toHaveProperty(
        "href",
        "http://localhost/admin/settings/maps",
      );
    });
  });

  describe("non admin users", () => {
    it("should show a help link when `show-metabase-links: true`", () => {
      setup({ isAdmin: false, showMetabaseLinks: true });

      const customMapOption = screen.getByRole("link", {
        name: "Custom map",
      });
      expect(customMapOption).toBeInTheDocument();
      expect(customMapOption).toHaveProperty(
        "href",
        "https://www.metabase.com/docs/latest/configuring-metabase/custom-maps.html",
      );
    });

    it("should show a help link when `show-metabase-links: false`", () => {
      setup({ isAdmin: false, showMetabaseLinks: false });

      const customMapOption = screen.getByRole("link", {
        name: "Custom map",
      });
      expect(customMapOption).toBeInTheDocument();
      expect(customMapOption).toHaveProperty(
        "href",
        "https://www.metabase.com/docs/latest/configuring-metabase/custom-maps.html",
      );
    });
  });
});
