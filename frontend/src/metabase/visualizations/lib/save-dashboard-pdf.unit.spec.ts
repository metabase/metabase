import { findPageBreakCandidates, getPageBreaks } from "./save-dashboard-pdf";

describe("save-dashboard-pdf", () => {
  describe("findPageBreakCandidates", () => {
    it("should find a potential page break between two cards", () => {
      const cards = [
        { top: 0, bottom: 99, height: 99, allowedBreaks: new Set<number>() },
        {
          top: 100,
          bottom: 200,
          height: 100,
          allowedBreaks: new Set<number>(),
        },
      ];

      const breaks = findPageBreakCandidates(cards, 1000);
      expect(breaks).toEqual([99]);
    });

    it("should include allowed breaks within cards", () => {
      const cards = [
        {
          top: 0,
          bottom: 300,
          height: 300,
          allowedBreaks: new Set<number>([100, 200]),
        },
        {
          top: 300,
          bottom: 400,
          height: 100,
          allowedBreaks: new Set<number>(),
        },
      ];

      const breaks = findPageBreakCandidates(cards, 1000);
      expect(breaks).toEqual([100, 200, 300]);
    });

    it("should include allowed breaks within the lowest card (metabase#83085)", () => {
      const cards = [
        {
          top: 0,
          bottom: 300,
          height: 300,
          allowedBreaks: new Set<number>([100, 200]),
        },
      ];

      const breaks = findPageBreakCandidates(cards, 250);
      expect(breaks).toEqual([100, 200]);
    });

    it("should not include breaks at or below the bottom of the lowest card", () => {
      const cards = [
        {
          top: 0,
          bottom: 300,
          height: 300,
          allowedBreaks: new Set<number>([100, 300, 350]),
        },
      ];

      const breaks = findPageBreakCandidates(cards, 250);
      expect(breaks).toEqual([100]);
    });

    it("should respect offset parameter", () => {
      const cards = [
        { top: 0, bottom: 100, height: 100, allowedBreaks: new Set<number>() },
        {
          top: 100,
          bottom: 200,
          height: 100,
          allowedBreaks: new Set<number>(),
        },
      ];

      const breaks = findPageBreakCandidates(cards, 1000, 50);
      expect(breaks).toEqual([150]);
    });

    it("should not include breaks that would trim any cards", () => {
      const cards = [
        {
          top: 0,
          bottom: 99,
          height: 99,
          allowedBreaks: new Set<number>([
            20, // the only break that would not trim any of the cards
            80,
          ]),
        },
        {
          top: 100,
          bottom: 200,
          height: 100,
          allowedBreaks: new Set<number>(),
        },
        {
          top: 50,
          bottom: 150,
          height: 100,
          allowedBreaks: new Set<number>(),
        },
      ];

      const breaks = findPageBreakCandidates(cards, 1000);
      expect(breaks).toEqual([20]);
    });
  });

  describe("getPageBreaks", () => {
    it("should return empty array when all cards fit in one page", () => {
      const cards = [
        { top: 0, bottom: 100, height: 100, allowedBreaks: new Set<number>() },
        {
          top: 100,
          bottom: 200,
          height: 100,
          allowedBreaks: new Set<number>(),
        },
      ];

      const breaks = getPageBreaks(cards, 300, 200, 100);
      expect(breaks).toEqual([]);
    });

    it("should choose break points close to optimal page height", () => {
      const cards = [
        { top: 0, bottom: 250, height: 250, allowedBreaks: new Set<number>() },
        { top: 250, bottom: 300, height: 50, allowedBreaks: new Set<number>() },
        {
          top: 300,
          bottom: 500,
          height: 200,
          allowedBreaks: new Set<number>(),
        },
      ];

      const optimalPageHeight = 270;
      const breaks = getPageBreaks(cards, optimalPageHeight, 500, 100);
      expect(breaks).toEqual([250]); // The page break at 250 is the closest to the optimal page height of 270
    });

    it("should create multiple breaks for very long content", () => {
      const cards = [
        { top: 0, bottom: 200, height: 200, allowedBreaks: new Set<number>() },
        {
          top: 200,
          bottom: 400,
          height: 200,
          allowedBreaks: new Set<number>(),
        },
        {
          top: 400,
          bottom: 600,
          height: 200,
          allowedBreaks: new Set<number>(),
        },
      ];

      const breaks = getPageBreaks(cards, 200, 600, 100);
      expect(breaks).toEqual([200, 400]);
    });

    it("should allow breaks that respect minimum page size", () => {
      const cards = [
        { top: 0, bottom: 100, height: 100, allowedBreaks: new Set<number>() },
        {
          top: 100,
          bottom: 250,
          height: 150,
          allowedBreaks: new Set<number>(),
        },
        { top: 250, bottom: 300, height: 50, allowedBreaks: new Set<number>() },
      ];

      const breaks = getPageBreaks(cards, 200, 300, 100);
      expect(breaks).toEqual([250]);
    });

    it("should not break if it would create pages smaller than minimum size", () => {
      const cards = [
        { top: 0, bottom: 150, height: 150, allowedBreaks: new Set<number>() },
        {
          top: 150,
          bottom: 400,
          height: 250,
          allowedBreaks: new Set<number>(),
        },
      ];

      // With minPageHeight of 200, breaking at 150 would create a first page
      // of only 150px height, which is less than minimum, so no breaks should occur
      const breaks = getPageBreaks(cards, 250, 400, 200);
      expect(breaks).toEqual([]);
    });

    it("should break a tall table at the bottom between rows", () => {
      const cards = [
        {
          top: 0,
          bottom: 1000,
          height: 1000,
          allowedBreaks: new Set<number>([
            100, 200, 300, 400, 500, 600, 700, 800, 900,
          ]),
        },
      ];

      const breaks = getPageBreaks(cards, 400, 1000, 300);
      expect(breaks).toEqual([400, 800]);
    });

    it("should not break a short table at the bottom", () => {
      // Sizes from a dashboard with an 892 px wide grid and a 134 px PDF header
      const cards = [
        { top: 0, bottom: 730, height: 730, allowedBreaks: new Set<number>() },
        {
          top: 736,
          bottom: 1006,
          height: 270,
          allowedBreaks: new Set<number>([850, 886, 922, 958, 994]),
        },
      ];

      const breaks = getPageBreaks(cards, 1109, 1146, 892, 134);
      expect(breaks).toEqual([]);
    });

    it("should not add a page when the rest fits on one page", () => {
      // Sizes from a dashboard with an 892 px wide grid and a 134 px PDF header
      const rowBottoms = Array.from(
        { length: 28 },
        (_, index) => 850 + index * 36,
      );
      const cards = [
        { top: 0, bottom: 730, height: 730, allowedBreaks: new Set<number>() },
        {
          top: 736,
          bottom: 1846,
          height: 1110,
          allowedBreaks: new Set<number>(rowBottoms),
        },
      ];

      const breaks = getPageBreaks(cards, 1109, 1980, 892, 134);
      expect(breaks).toEqual([1020]);
    });
  });
});
