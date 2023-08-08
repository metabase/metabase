import _ from "underscore";
import { EChartsOption } from "echarts";

const toolboxOptions = {
  feature: {
    saveAsImage: { show: true },
  },
};

const buildData = () => {
  return _.times(5000, n => [`x: ${n}`, n, (2000 - n) * 2, n + 500]);
};

export const DATA = [
  [120, 132, 101, 134, 90, 230, 210],
  [220, 182, 191, 234, 290, 330, 310],
  [150, 232, 201, 154, 190, 330, 410],
  [320, 332, 301, 334, 390, 330, 320],
  [820, 932, 901, 934, 1290, 1330, 1320],
];

export function getStackedDataValue({
  seriesIndex,
  dataIndex,
}: {
  seriesIndex: number;
  dataIndex: number;
}) {
  let stackedValue = 0;
  for (let i = 0; i <= seriesIndex; i++) {
    stackedValue += DATA[i][dataIndex];
  }
  console.log("stackedValue", stackedValue);
  return stackedValue;
}

export const getComboChartOptions = (): EChartsOption => {
  return {
    title: {
      text: "Stacked Area Chart",
    },
    // tooltip: {
    //   trigger: "axis",
    //   axisPointer: {
    //     type: "cross",
    //     label: {
    //       backgroundColor: "#6a7985",
    //     },
    //   },
    // },
    legend: {
      data: ["Email", "Union Ads", "Video Ads", "Direct", "Search Engine"],
    },
    toolbox: {
      feature: {
        saveAsImage: {},
      },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      containLabel: true,
    },
    xAxis: [
      {
        type: "category",
        boundaryGap: false,
        data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
    ],
    yAxis: [
      {
        type: "value",
      },
    ],
    series: [
      {
        name: "Email",
        type: "line",
        stack: "Total",
        areaStyle: {},
        emphasis: {
          focus: "series",
        },
        data: DATA[0],
      },
      {
        name: "Union Ads",
        type: "line",
        stack: "Total",
        areaStyle: {},
        emphasis: {
          focus: "series",
        },
        data: DATA[1],
      },
      {
        name: "Video Ads",
        type: "line",
        stack: "Total",
        areaStyle: {},
        emphasis: {
          focus: "series",
        },
        data: DATA[2],
      },
      {
        name: "Direct",
        type: "line",
        stack: "Total",
        areaStyle: {},
        emphasis: {
          focus: "series",
        },
        data: DATA[3],
      },
      {
        name: "Search Engine",
        type: "line",
        stack: "Total",
        label: {
          show: true,
          position: "top",
        },
        areaStyle: {},
        emphasis: {
          focus: "series",
        },
        data: DATA[4],
      },
    ],
  };

  // return {
  //   toolboxOptions,
  //   dataset: {
  //     // Provide a set of data.
  //     source: [
  //       ["product", "2015", "2016", "2017"],
  //       ...buildData(),
  //       // ["Matcha Latte", 43.3, 85.8, 93.7],
  //       // ["Milk Tea", 83.1, 73.4, 55.1],
  //       // ["Cheese Cocoa", 86.4, 65.2, 82.5],
  //       // ["Walnut Brownie", 72.4, 53.9, 39.1],
  //     ],
  //   },
  //   // Declare an x-axis (category axis).
  //   // The category map the first column in the dataset by default.
  //   xAxis: { type: "category" },
  //   // Declare a y-axis (value axis).
  //   yAxis: {},
  //   // Declare several 'bar' series,
  //   // every series will auto-map to each column by default.
  //   series: [
  //     {
  //       type: "line",
  //       id: "1",
  //     },
  //     { type: "line", id: "2" },
  //     // { type: "bar", id: "3" },
  //   ],
  //   brush: {
  //     toolbox: ["lineX"],
  //     xAxisIndex: 0,
  //   },
  // };
};
