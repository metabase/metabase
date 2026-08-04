import { explorationPathWithSearch, isExplorationUrl } from "./explorations";

describe("urls > explorations", () => {
  describe("isExplorationUrl", () => {
    it("matches exploration paths", () => {
      expect(isExplorationUrl("/question/research/1")).toBe(true);
      expect(isExplorationUrl("/question/research/1/page/19")).toBe(true);
      expect(isExplorationUrl("/question/research/1/summary")).toBe(true);
    });

    it("rejects non-exploration question paths", () => {
      expect(isExplorationUrl("/question/123")).toBe(false);
      expect(isExplorationUrl("/document/1")).toBe(false);
    });
  });

  describe("explorationPathWithSearch", () => {
    it("preserves search params on the destination path", () => {
      expect(
        explorationPathWithSearch(
          "/question/research/1/page/19",
          "?timeline=1&tab=outline",
        ),
      ).toBe("/question/research/1/page/19?timeline=1&tab=outline");
    });

    it("retargets an open comments panel to the destination page", () => {
      expect(
        explorationPathWithSearch(
          "/question/research/1/page/19",
          "?comments=550e8400-e29b-41d4-a716-446655440000&timeline=1",
        ),
      ).toBe("/question/research/1/page/19?comments=19&timeline=1");
    });

    it("leaves comments alone when the destination is not a page", () => {
      expect(
        explorationPathWithSearch(
          "/question/research/1/summary",
          "?comments=19&tab=outline",
        ),
      ).toBe("/question/research/1/summary?comments=19&tab=outline");
    });

    it("strips any query already on the pathname in favor of location search", () => {
      expect(
        explorationPathWithSearch(
          "/question/research/1/page/19?stale=1",
          "?timeline=1",
        ),
      ).toBe("/question/research/1/page/19?timeline=1");
    });

    it("returns the bare path when there is no search", () => {
      expect(
        explorationPathWithSearch("/question/research/1/page/19", ""),
      ).toBe("/question/research/1/page/19");
    });
  });
});
