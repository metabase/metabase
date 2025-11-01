import * as parserBabel from "prettier/parser-babel";
import * as prettierPluginEstree from "prettier/plugins/estree";

import { format, getBuilders } from "./prettier-loader";

describe("prettier-loader", () => {
  describe("format", () => {
    it("should lazy load prettier and format code", async () => {
      const result = await format("const x=1", {
        parser: "babel",
        plugins: [parserBabel, prettierPluginEstree],
      });

      expect(result).toContain("const x = 1");
    });
  });

  describe("getBuilders", () => {
    it("should lazy load prettier doc builders", async () => {
      const builders = await getBuilders();

      expect(builders).toHaveProperty("join");
      expect(builders).toHaveProperty("indent");
      expect(builders).toHaveProperty("softline");
      expect(builders).toHaveProperty("line");
      expect(builders).toHaveProperty("group");
      expect(builders).toHaveProperty("ifBreak");
    });
  });
});
