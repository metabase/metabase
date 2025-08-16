import { findPageBreakCandidates, getPageBreaks } from "./save-dashboard-pdf";

describe("saveDashboardPdf filename formatting", () => {
  it("should format the filename without timezone", async () => {
    // Arrange: fixed date and minimal DOM
    const fixedDate = new Date("2025-07-23T15:30:00");
    // Minimal DOM structure for selector and gridNode
    const gridNode = document.createElement("div");
    gridNode.className = "react-grid-layout";
    // Set required properties for the test
    Object.defineProperty(gridNode, "offsetWidth", { value: 100 });
    Object.defineProperty(gridNode, "offsetHeight", { value: 100 });
    document.body.appendChild(gridNode);
    // Patch document.querySelector to return our gridNode
    const originalQuerySelector = document.querySelector;
    document.querySelector = (selector: string) => {
      if (selector === "#fake") {
        return { querySelector: () => gridNode } as any;
      }
      return originalQuerySelector.call(document, selector);
    };

    // Patch jspdf to intercept the save
    let savedFileName = "";
    jest.resetModules();
    jest.doMock("jspdf", () => {
      return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
          addPage: jest.fn(),
          deletePage: jest.fn(),
          setFillColor: jest.fn(),
          rect: jest.fn(),
          addImage: jest.fn(),
          link: jest.fn(),
          save: (fileName: string) => {
            savedFileName = fileName;
          },
        })),
      };
    });

    // Patch html2canvas to return a dummy canvas
    jest.doMock("html2canvas-pro", () => ({
      __esModule: true,
      default: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext("2d");
        ctx && ctx.fillRect(0, 0, 100, 100);
        return canvas;
      },
    }));

    // Act
    const { saveDashboardPdf } = await import("./save-dashboard-pdf");
    await saveDashboardPdf({
      selector: "#fake",
      dashboardName: "TestDash",
      includeBranding: false,
      now: fixedDate,
    });

    // Assert
    expect(savedFileName).toMatch(/^TestDash 2025-07-23[ ,]15:30/);

    // Cleanup
    document.querySelector = originalQuerySelector;
    document.body.removeChild(gridNode);
    jest.resetModules();
  });
});

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
});
