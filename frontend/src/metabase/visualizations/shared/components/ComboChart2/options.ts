import { EChartsOption } from "echarts";

const toolboxOptions = {
  feature: {
    saveAsImage: { show: true },
  },
};

export const getComboChartOptions = (): EChartsOption => {
  return {
    toolboxOptions,
    dataset: {
      // Provide a set of data.
      source: [
        ["product", "2015", "2016", "2017"],
        ["Matcha Latte", 43.3, 85.8, 93.7],
        ["Milk Tea", 83.1, 73.4, 55.1],
        ["Cheese Cocoa", 86.4, 65.2, 82.5],
        ["Walnut Brownie", 72.4, 53.9, 39.1],
      ],
    },
    // Declare an x-axis (category axis).
    // The category map the first column in the dataset by default.
    xAxis: { type: "category" },
    // Declare a y-axis (value axis).
    yAxis: {},
    // Declare several 'bar' series,
    // every series will auto-map to each column by default.
    series: [{ type: "bar" }, { type: "bar" }, { type: "bar" }],
  };
};
