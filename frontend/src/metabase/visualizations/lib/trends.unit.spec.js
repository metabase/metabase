import { getNormalizedStackedTrendDatas } from "./trends";

describe("getNormalizedStackedTrendDatas", () => {
  const mockTrendData = ys => ys.map((y, i) => [i, y]); // use index as x

  it("should return correct normalized trend data", () => {
    const a = [5, 10, 8, 12];
    const b = [6, 3, 7, 15];
    const c = [12, 13, 18, 20];
    const sums = [23, 26, 33, 47];

    expect(
      getNormalizedStackedTrendDatas([
        mockTrendData(a),
        mockTrendData(b),
        mockTrendData(c),
      ]),
    ).toEqual([
      mockTrendData([
        a[0] / sums[0],
        a[1] / sums[1],
        a[2] / sums[2],
        a[3] / sums[3],
      ]),
      mockTrendData([
        b[0] / sums[0],
        b[1] / sums[1],
        b[2] / sums[2],
        b[3] / sums[3],
      ]),
      mockTrendData([
        c[0] / sums[0],
        c[1] / sums[1],
        c[2] / sums[2],
        c[3] / sums[3],
      ]),
    ]);
  });

  it("should return an empty array when there is no trend data", () => {
    expect(getNormalizedStackedTrendDatas([])).toStrictEqual([]);
  });
});
