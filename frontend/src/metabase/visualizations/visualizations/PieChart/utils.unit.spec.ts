import { getTooltipModel } from "./utils";

const slices = [
  {
    key: "foo",
    value: 100,
    displayValue: 100,
    percentage: 0.34,
    rowIndex: 0,
    color: "green",
  },
  {
    key: "bar",
    value: 200,
    displayValue: 200,
    percentage: 0.66,
    rowIndex: 1,
    color: "red",
  },
];

const slicesWithOther = [
  {
    key: "foo",
    value: 100,
    displayValue: 100,
    percentage: 0.28571429,
    rowIndex: 0,
    color: "green",
  },
  {
    key: "bar",
    value: 200,
    displayValue: 200,
    percentage: 0.57142857,
    rowIndex: 1,
    color: "red",
  },
  {
    key: "Other",
    value: 50,
    displayValue: 50,
    percentage: 0.14285714,
    rowIndex: 2,
    color: "grey",
  },
];

const stateSlices = [
  {
    key: "AK",
    value: 474,
    displayValue: 474,
    percentage: 0.06519944979367263,
    rowIndex: 0,
    color: "#509EE3",
  },
  {
    key: "AL",
    value: 504,
    displayValue: 504,
    percentage: 0.06932599724896836,
    rowIndex: 1,
    color: "#227FD2",
  },
  {
    key: "CA",
    value: 613,
    displayValue: 613,
    percentage: 0.08431911966987621,
    rowIndex: 2,
    color: "#88BF4D",
  },
  {
    key: "CO",
    value: 732,
    displayValue: 732,
    percentage: 0.10068775790921596,
    rowIndex: 3,
    color: "#689636",
  },
  {
    key: "IA",
    value: 583,
    displayValue: 583,
    percentage: 0.08019257221458047,
    rowIndex: 5,
    color: "#8A5EB0",
  },
  {
    key: "MN",
    value: 788,
    displayValue: 788,
    percentage: 0.10839064649243467,
    rowIndex: 6,
    color: "#EF8C8C",
  },
  {
    key: "MT",
    value: 872,
    displayValue: 872,
    percentage: 0.11994497936726273,
    rowIndex: 7,
    color: "#E75454",
  },
  {
    key: "NY",
    value: 635,
    displayValue: 635,
    percentage: 0.0873452544704264,
    rowIndex: 8,
    color: "#F9D45C",
  },
  {
    key: "TX",
    value: 1342,
    displayValue: 1342,
    percentage: 0.18459422283356258,
    rowIndex: 9,
    color: "#F7C41F",
  },
  {
    key: "WI",
    value: 706,
    displayValue: 706,
    percentage: 0.09711141678129298,
    rowIndex: 10,
    color: "#F2A86F",
  },
  {
    key: "DE",
    value: 21.81,
    displayValue: 21,
    percentage: 0.0028885832187070153,
    rowIndex: 4,
    color: "#A989C5",
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

    it("should return a `value` for the `other` slice #42458", () => {
      const { bodyRows } = getTooltipModel(
        slicesWithOther,
        0,
        dimensionColumnName,
        dimensionFormatter,
        metricFormatter,
      );

      expect(bodyRows?.[bodyRows.length - 1].value).toBe(
        slicesWithOther[slicesWithOther.length - 1].displayValue,
      );
    });

    it("is not affected by minimum slice percentage setting #32430 #33342", () => {
      const smallSliceIndex = stateSlices.length - 1;
      const { headerRows } = getTooltipModel(
        stateSlices,
        smallSliceIndex,
        dimensionColumnName,
        dimensionFormatter,
        metricFormatter,
      );

      expect(headerRows[0].value).toBe(
        stateSlices[smallSliceIndex].displayValue,
      );
    });
  });
});
