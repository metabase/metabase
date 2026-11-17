import { screen } from "__support__/ui";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";

import { setup } from "./setup";

jest.mock("metabase/embedding-sdk/config", () => ({
  ...jest.requireActual("metabase/embedding-sdk/config"),
  isEmbeddingSdk: jest.fn(() => false),
}));

describe("CustomMapFooter (OSS)", () => {
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

  describe("embedding SDK", () => {
    afterEach(() => {
      jest.mocked(isEmbeddingSdk).mockReturnValue(false);
    });

    it("should not show the link, which has no route to go to", () => {
      jest.mocked(isEmbeddingSdk).mockReturnValue(true);
      setup({ isAdmin: true, showMetabaseLinks: true });

      expect(
        screen.queryByRole("link", { name: "Custom map" }),
      ).not.toBeInTheDocument();
    });
  });
});
