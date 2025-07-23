import {
  findPageBreakCandidates,
  getPageBreaks,
  saveDashboardPdf,
} from "./save-dashboard-pdf";

describe("saveDashboardPdf filename formatting", () => {
  it("should format the filename without timezone", () => {
    // Mock Date to a fixed value
    const RealDate = Date;
    global.Date = class extends RealDate {
      constructor() {
        super();
        return new RealDate("2025-07-23T15:30:00");
      }
    } as DateConstructor;

    // We need to extract the filename logic, so let's call the function and intercept the save
    let savedFileName = "";
    const originalSave = window.URL.createObjectURL;
    window.URL.createObjectURL = () => "blob:url";
    const originalSaveFn = (window as any).saveAs;
    (window as any).saveAs = (blob: any, fileName: string) => {
      savedFileName = fileName;
    };

    // Patch document.querySelector to avoid DOM errors
    const originalQuerySelector = document.querySelector;
    document.querySelector = () =>
      ({
        querySelector: () => ({
          offsetWidth: 100,
          offsetHeight: 100,
          getBoundingClientRect: () => ({ top: 0, bottom: 100, height: 100 }),
          append: () => {},
          removeChild: () => {},
          appendChild: () => {},
        }),
      }) as any;

    // Call the function (it will error before saving, but we only care about the filename)
    saveDashboardPdf({
      selector: "#fake",
      dashboardName: "TestDash",
      includeBranding: false,
    }).catch(() => {});

    expect(savedFileName.startsWith("TestDash 2025-07-23 15:30")).toBe(true);

    // Restore mocks
    global.Date = RealDate;
    window.URL.createObjectURL = originalSave;
    (window as any).saveAs = originalSaveFn;
    document.querySelector = originalQuerySelector;
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
