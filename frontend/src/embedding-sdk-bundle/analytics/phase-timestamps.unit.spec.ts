import {
  getPhaseOffsets,
  recordPhase,
  resetPhaseTimestamps,
} from "./phase-timestamps";

describe("phase-timestamps", () => {
  beforeEach(() => {
    resetPhaseTimestamps();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("recordPhase", () => {
    it("records a phase timestamp via performance.now()", () => {
      jest.spyOn(performance, "now").mockReturnValue(500);

      recordPhase("init_start");

      const offsets = getPhaseOffsets(0);
      expect(offsets).toEqual({ init_start: 500 });
    });

    it("keeps only the first call for a given phase", () => {
      jest
        .spyOn(performance, "now")
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(200);

      recordPhase("init_start");
      recordPhase("init_start");

      const offsets = getPhaseOffsets(0);
      expect(offsets).toEqual({ init_start: 100 });
    });

    it("records multiple distinct phases independently", () => {
      jest
        .spyOn(performance, "now")
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(200);

      recordPhase("init_start");
      recordPhase("init_ready");

      const offsets = getPhaseOffsets(0);
      expect(offsets).toEqual({ init_start: 100, init_ready: 200 });
    });
  });

  describe("getPhaseOffsets", () => {
    it("returns null when no phases have been recorded", () => {
      expect(getPhaseOffsets(0)).toBeNull();
    });

    it("returns offsets relative to the given script start time", () => {
      jest
        .spyOn(performance, "now")
        .mockReturnValueOnce(150)
        .mockReturnValueOnce(350);

      recordPhase("init_start");
      recordPhase("init_ready");

      const offsets = getPhaseOffsets(50);
      expect(offsets).toEqual({ init_start: 100, init_ready: 300 });
    });

    it("rounds offsets to integers", () => {
      jest.spyOn(performance, "now").mockReturnValue(155.7);

      recordPhase("component_start");

      const offsets = getPhaseOffsets(100.3);
      expect(offsets).toEqual({ component_start: 55 });
    });
  });

  describe("resetPhaseTimestamps", () => {
    it("clears all recorded phases", () => {
      jest.spyOn(performance, "now").mockReturnValue(100);
      recordPhase("init_start");

      resetPhaseTimestamps();

      expect(getPhaseOffsets(0)).toBeNull();
    });

    it("allows re-recording after reset", () => {
      jest
        .spyOn(performance, "now")
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(999);

      recordPhase("init_start");
      resetPhaseTimestamps();
      recordPhase("init_start");

      const offsets = getPhaseOffsets(0);
      expect(offsets).toEqual({ init_start: 999 });
    });
  });
});
