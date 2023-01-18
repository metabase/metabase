import { getTooltipModel } from "./utils";

const slices = [
  {
    key: "foo",
    value: 100,
    color: "green",
  },
  {
    key: "bar",
    value: 200,
    color: "red",
  },
];

const dimensionColumnName = "dimension_column";
const dimensionFormatter = (value: unknown) => `dimension:${value}`;
const metricFormatter = (value: unknown) => `metric:${value}`;

describe("utils", () => {
  describe("getTooltipModel", () => {
    it("creates tooltip model", () => {
      const { headerTitle, headerRows, bodyRows, showTotal, showPercentages } =
        getTooltipModel(
          slices,
          0,
          dimensionColumnName,
          dimensionFormatter,
          metricFormatter,
        );
      expect(headerTitle).toBe(dimensionColumnName);
      expect(headerRows).toStrictEqual([
        {
          color: "green",
          formatter: metricFormatter,
          name: "dimension:foo",
          value: 100,
        },
      ]);
      expect(bodyRows).toStrictEqual([
        {
          color: "red",
          formatter: metricFormatter,
          name: "dimension:bar",
          value: 200,
        },
      ]);
      expect(showTotal).toBe(true);
      expect(showPercentages).toBe(true);
    });
  });
});
