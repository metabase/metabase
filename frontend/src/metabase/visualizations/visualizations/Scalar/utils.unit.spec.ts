import { TITLE_2_LINES_HEIGHT_THRESHOLD } from "./constants";
import { getValueHeight, getValueWidth } from "./utils";

describe("Scalar > utils", () => {
  describe("getValueHeight", () => {
    const titleHeight2Lines = TITLE_2_LINES_HEIGHT_THRESHOLD + 1;
    const titleHeight1Line = TITLE_2_LINES_HEIGHT_THRESHOLD - 1;

    const height2LinesDashboardNormalTitle = getValueHeight(titleHeight2Lines, {
      isDashboard: true,
      showSmallTitle: false,
    });
    const height2LinesDashboardSmallTitle = getValueHeight(titleHeight2Lines, {
      isDashboard: true,
      showSmallTitle: true,
    });
    const height2LinesNoDashboardNormalTitle = getValueHeight(
      titleHeight2Lines,
      {
        isDashboard: false,
        showSmallTitle: false,
      },
    );
    const height2LinesNoDashboardSmallTitle = getValueHeight(
      titleHeight2Lines,
      {
        isDashboard: false,
        showSmallTitle: true,
      },
    );
    const height1LineDashboardNormalTitle = getValueHeight(titleHeight1Line, {
      isDashboard: true,
      showSmallTitle: false,
    });
    const height1LineDashboardSmallTitle = getValueHeight(titleHeight1Line, {
      isDashboard: true,
      showSmallTitle: true,
    });
    const height1LineNoDashboardNormalTitle = getValueHeight(titleHeight1Line, {
      isDashboard: false,
      showSmallTitle: false,
    });
    const height1LineNoDashboardSmallTitle = getValueHeight(titleHeight1Line, {
      isDashboard: false,
      showSmallTitle: true,
    });

    it("should give the same height on non-dashboard regardless of title size", () => {
      expect(height1LineNoDashboardSmallTitle).toBe(
        height1LineNoDashboardNormalTitle,
      );
      expect(height2LinesNoDashboardSmallTitle).toBe(
        height2LinesNoDashboardNormalTitle,
      );
    });

    it("should give greater height when title is smaller", () => {
      expect(height1LineDashboardSmallTitle).toBeGreaterThan(
        height1LineDashboardNormalTitle,
      );
      expect(height2LinesDashboardSmallTitle).toBeGreaterThan(
        height2LinesDashboardNormalTitle,
      );
    });

    it("should give greater height on non-dashboard where title is hidden", () => {
      expect(height2LinesNoDashboardNormalTitle).toBeGreaterThan(
        height2LinesDashboardNormalTitle,
      );
      expect(height2LinesNoDashboardSmallTitle).toBeGreaterThan(
        height2LinesDashboardSmallTitle,
      );
      expect(height1LineNoDashboardNormalTitle).toBeGreaterThan(
        height1LineDashboardNormalTitle,
      );
      expect(height1LineNoDashboardSmallTitle).toBeGreaterThan(
        height1LineDashboardSmallTitle,
      );
    });

    it("should not return negative values", () => {
      expect(height2LinesDashboardNormalTitle).toBeGreaterThanOrEqual(0);
      expect(height2LinesDashboardSmallTitle).toBeGreaterThanOrEqual(0);
      expect(height2LinesNoDashboardNormalTitle).toBeGreaterThanOrEqual(0);
      expect(height2LinesNoDashboardSmallTitle).toBeGreaterThanOrEqual(0);
      expect(height1LineDashboardNormalTitle).toBeGreaterThanOrEqual(0);
      expect(height1LineDashboardSmallTitle).toBeGreaterThanOrEqual(0);
      expect(height1LineNoDashboardNormalTitle).toBeGreaterThanOrEqual(0);
      expect(height1LineNoDashboardSmallTitle).toBeGreaterThanOrEqual(0);

      expect(
        getValueHeight(1, { isDashboard: true, showSmallTitle: false }),
      ).toBeGreaterThanOrEqual(0);
      expect(
        getValueHeight(1, { isDashboard: false, showSmallTitle: false }),
      ).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getValueWidth", () => {
    it("should not return negative values", () => {
      expect(getValueWidth(1)).toBeGreaterThanOrEqual(0);
      expect(getValueWidth(1)).toBeGreaterThanOrEqual(0);
    });
  });
});
