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

      const breaks = findPageBreakCandidates(cards);
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

      const breaks = findPageBreakCandidates(cards);
      expect(breaks).toEqual([100, 200, 300]);
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

      const breaks = findPageBreakCandidates(cards, 50);
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

      const breaks = findPageBreakCandidates(cards);
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

      const breaks = getPageBreaks(cards, 300, 200);
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
      const breaks = getPageBreaks(cards, optimalPageHeight, 500);
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

      const breaks = getPageBreaks(cards, 200, 600);
      expect(breaks).toEqual([200, 400]);
    });

    it("should respect minimum page size constraint", () => {
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

      const breaks = getPageBreaks(cards, 200, 300);
      expect(breaks).toEqual([250]);
    });
  });
});
