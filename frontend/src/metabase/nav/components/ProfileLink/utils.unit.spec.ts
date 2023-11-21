import type { Settings } from "metabase-types/api";
import { getHelpLink } from "./utils";

const setup = ({
  helpLinkSetting,
  helpLinkCustomDestinationSetting = "customDestination",
  isAdmin = false,
  isPaidPlan = false,
}: {
  helpLinkSetting: Settings["help-link"];
  helpLinkCustomDestinationSetting?: Settings["help-link-custom-destination"];
  isAdmin?: boolean;
  isPaidPlan?: boolean;
}) => {
  return getHelpLink({
    helpLinkSetting,
    helpLinkCustomDestinationSetting,
    isAdmin,
    isPaidPlan,
    tag: "mockTag",
    bugReportDetails: "mockBugReportDetails",
  });
};
describe("getHelpLink", () => {
  describe("when the setting is set to hidden", () => {
    it("should return {visible:false}", () => {
      const link = setup({
        helpLinkSetting: "hidden",
      });
      expect(link).toHaveProperty("visible", false);
    });
  });

  describe("when the setting is `custom`", () => {
    it("should return  the custom destination", () => {
      const link = setup({
        helpLinkSetting: "custom",
        helpLinkCustomDestinationSetting: "https://custom.example.org/help",
      });

      expect(link).toHaveProperty("visible", true);
      expect(link).toHaveProperty("href", "https://custom.example.org/help");
    });
  });

  describe("when the setting is `metabase_default`", () => {
    describe("when admin on paid plan", () => {
      it("should return the default /help-premium link", () => {
        const link = setup({
          isAdmin: true,
          isPaidPlan: true,
          helpLinkSetting: "metabase_default",
        });

        expect(link).toHaveProperty("visible", true);
        expect(link).toHaveProperty(
          "href",
          "https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=mockTag&diag=mockBugReportDetails",
        );
      });
    });

    describe("when non admin", () => {
      it("should return the default /help link", () => {
        const link = setup({
          isAdmin: false,
          isPaidPlan: true,
          helpLinkSetting: "metabase_default",
        });

        expect(link).toHaveProperty("visible", true);
        expect(link).toHaveProperty(
          "href",
          "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=mockTag",
        );
      });
    });
  });
});
