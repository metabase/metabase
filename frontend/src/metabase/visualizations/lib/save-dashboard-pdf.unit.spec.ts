import {
  findPageBreakCandidates,
  getLinkAnnotationsForPage,
  getPageBreaks,
} from "./save-dashboard-pdf";

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
  });

  describe("getLinkAnnotationsForPage (metabase#35742)", () => {
    const verticalOffset = 50;
    const pagePadding = 16;

    it("places a link on the first page when it falls within the page slice", () => {
      const links = [
        { url: "https://example.com", x: 10, y: 100, width: 80, height: 20 },
      ];

      const annotations = getLinkAnnotationsForPage(
        links,
        0,
        300,
        verticalOffset,
        pagePadding,
      );

      // Canvas-space top = link.y + verticalOffset = 150
      // PDF y = pagePadding + (canvasTop - pageStart) = 16 + 150 = 166
      expect(annotations).toEqual([
        {
          url: "https://example.com",
          x: 16 + 10,
          y: 16 + 150,
          width: 80,
          height: 20,
        },
      ]);
    });

    it("translates link coordinates relative to the page slice on later pages", () => {
      const links = [
        { url: "https://example.com", x: 5, y: 350, width: 60, height: 18 },
      ];

      // Page starts at canvas y=400 (after vertical offset, link sits at 400)
      const annotations = getLinkAnnotationsForPage(
        links,
        400,
        300,
        verticalOffset,
        pagePadding,
      );

      // canvasTop = 350 + 50 = 400, pageStart = 400 → relative y = 0
      expect(annotations).toEqual([
        {
          url: "https://example.com",
          x: 16 + 5,
          y: 16 + 0,
          width: 60,
          height: 18,
        },
      ]);
    });

    it("excludes links above the current page slice", () => {
      const links = [
        { url: "https://example.com", x: 0, y: 10, width: 50, height: 15 },
      ];

      // canvasTop = 60 — sits in page 1, not page 2
      const annotations = getLinkAnnotationsForPage(
        links,
        200,
        300,
        verticalOffset,
        pagePadding,
      );

      expect(annotations).toEqual([]);
    });

    it("excludes links below the current page slice", () => {
      const links = [
        { url: "https://example.com", x: 0, y: 500, width: 50, height: 15 },
      ];

      // canvasTop = 550 — sits in a later page, not page 1
      const annotations = getLinkAnnotationsForPage(
        links,
        0,
        300,
        verticalOffset,
        pagePadding,
      );

      expect(annotations).toEqual([]);
    });

    it("excludes links that straddle a page break", () => {
      const links = [
        { url: "https://example.com", x: 0, y: 240, width: 100, height: 40 },
      ];

      // canvasTop = 290, canvasBottom = 330, pageEnd = 300 → straddles, skip
      const annotations = getLinkAnnotationsForPage(
        links,
        0,
        300,
        verticalOffset,
        pagePadding,
      );

      expect(annotations).toEqual([]);
    });

    it("returns an empty list when there are no links", () => {
      const annotations = getLinkAnnotationsForPage(
        [],
        0,
        300,
        verticalOffset,
        pagePadding,
      );

      expect(annotations).toEqual([]);
    });

    it("includes multiple links on the same page", () => {
      const links = [
        { url: "https://a.example", x: 0, y: 10, width: 50, height: 15 },
        { url: "https://b.example", x: 60, y: 30, width: 70, height: 18 },
      ];

      const annotations = getLinkAnnotationsForPage(
        links,
        0,
        500,
        verticalOffset,
        pagePadding,
      );

      expect(annotations).toEqual([
        {
          url: "https://a.example",
          x: 16,
          y: 16 + 60,
          width: 50,
          height: 15,
        },
        {
          url: "https://b.example",
          x: 16 + 60,
          y: 16 + 80,
          width: 70,
          height: 18,
        },
      ]);
    });
  });
});
