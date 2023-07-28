import * as echarts from "echarts";
import { getComboChartOptions } from "metabase/visualizations/shared/components/ComboChart2/options";
import { EChartsOption } from "echarts";
import { treeMapData, mapData } from "metabase/static-viz/lib/mock-data";

// no setTimeout in the polyglotvm, maybe it is possible to add it? But this hack still works
global.setTimeout = (fn: any) => {};

const patchSvgForBatik = (svg: string) => {
  return svg.replace(`xmlns="http://www.w3.org/2000/svg"`, "");
};

const renderEChart = (option: EChartsOption, width: number, height: number) => {
  const chart = echarts.init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  });

  chart.setOption(option);
  return patchSvgForBatik(chart.renderToSVGString());
};

export const renderComboChart2 = ({ width = 600, height = 400 } = {}) => {
  return renderEChart(getComboChartOptions(), width, height);
};

export const renderTreeMap = ({ width = 600, height = 400 } = {}) => {
  function getLevelOption() {
    return [
      {
        itemStyle: {
          borderWidth: 0,
          gapWidth: 5,
        },
      },
      {
        itemStyle: {
          gapWidth: 1,
        },
      },
      {
        colorSaturation: [0.35, 0.5],
        itemStyle: {
          gapWidth: 1,
          borderColorSaturation: 0.6,
        },
      },
    ];
  }

  return renderEChart(
    {
      title: {
        text: "Disk Usage",
        left: "center",
      },
      series: [
        {
          name: "Disk Usage",
          type: "treemap",
          visibleMin: 300,
          label: {
            show: true,
            formatter: "{b}",
          },
          itemStyle: {
            borderColor: "#fff",
          },
          levels: getLevelOption(),
          data: treeMapData,
        },
      ],
    },
    width,
    height,
  );
};

export const renderHeatMap = ({ width = 600, height = 400 } = {}) => {

  const hours = [
    '12a', '1a', '2a', '3a', '4a', '5a', '6a',
    '7a', '8a', '9a', '10a', '11a',
    '12p', '1p', '2p', '3p', '4p', '5p',
    '6p', '7p', '8p', '9p', '10p', '11p'
  ];

  const days = [
    'Saturday', 'Friday', 'Thursday',
    'Wednesday', 'Tuesday', 'Monday', 'Sunday'
  ];

  const data = [[0, 0, 5], [0, 1, 1], [0, 2, 0], [0, 3, 0], [0, 4, 0], [0, 5, 0], [0, 6, 0], [0, 7, 0], [0, 8, 0], [0, 9, 0], [0, 10, 0], [0, 11, 2], [0, 12, 4], [0, 13, 1], [0, 14, 1], [0, 15, 3], [0, 16, 4], [0, 17, 6], [0, 18, 4], [0, 19, 4], [0, 20, 3], [0, 21, 3], [0, 22, 2], [0, 23, 5], [1, 0, 7], [1, 1, 0], [1, 2, 0], [1, 3, 0], [1, 4, 0], [1, 5, 0], [1, 6, 0], [1, 7, 0], [1, 8, 0], [1, 9, 0], [1, 10, 5], [1, 11, 2], [1, 12, 2], [1, 13, 6], [1, 14, 9], [1, 15, 11], [1, 16, 6], [1, 17, 7], [1, 18, 8], [1, 19, 12], [1, 20, 5], [1, 21, 5], [1, 22, 7], [1, 23, 2], [2, 0, 1], [2, 1, 1], [2, 2, 0], [2, 3, 0], [2, 4, 0], [2, 5, 0], [2, 6, 0], [2, 7, 0], [2, 8, 0], [2, 9, 0], [2, 10, 3], [2, 11, 2], [2, 12, 1], [2, 13, 9], [2, 14, 8], [2, 15, 10], [2, 16, 6], [2, 17, 5], [2, 18, 5], [2, 19, 5], [2, 20, 7], [2, 21, 4], [2, 22, 2], [2, 23, 4], [3, 0, 7], [3, 1, 3], [3, 2, 0], [3, 3, 0], [3, 4, 0], [3, 5, 0], [3, 6, 0], [3, 7, 0], [3, 8, 1], [3, 9, 0], [3, 10, 5], [3, 11, 4], [3, 12, 7], [3, 13, 14], [3, 14, 13], [3, 15, 12], [3, 16, 9], [3, 17, 5], [3, 18, 5], [3, 19, 10], [3, 20, 6], [3, 21, 4], [3, 22, 4], [3, 23, 1], [4, 0, 1], [4, 1, 3], [4, 2, 0], [4, 3, 0], [4, 4, 0], [4, 5, 1], [4, 6, 0], [4, 7, 0], [4, 8, 0], [4, 9, 2], [4, 10, 4], [4, 11, 4], [4, 12, 2], [4, 13, 4], [4, 14, 4], [4, 15, 14], [4, 16, 12], [4, 17, 1], [4, 18, 8], [4, 19, 5], [4, 20, 3], [4, 21, 7], [4, 22, 3], [4, 23, 0], [5, 0, 2], [5, 1, 1], [5, 2, 0], [5, 3, 3], [5, 4, 0], [5, 5, 0], [5, 6, 0], [5, 7, 0], [5, 8, 2], [5, 9, 0], [5, 10, 4], [5, 11, 1], [5, 12, 5], [5, 13, 10], [5, 14, 5], [5, 15, 7], [5, 16, 11], [5, 17, 6], [5, 18, 0], [5, 19, 5], [5, 20, 3], [5, 21, 4], [5, 22, 2], [5, 23, 0], [6, 0, 1], [6, 1, 0], [6, 2, 0], [6, 3, 0], [6, 4, 0], [6, 5, 0], [6, 6, 0], [6, 7, 0], [6, 8, 0], [6, 9, 0], [6, 10, 1], [6, 11, 0], [6, 12, 2], [6, 13, 1], [6, 14, 3], [6, 15, 4], [6, 16, 0], [6, 17, 0], [6, 18, 0], [6, 19, 0], [6, 20, 1], [6, 21, 2], [6, 22, 2], [6, 23, 6]]
    .map(function (item) {
      return [item[1], item[0], item[2] || '-'];
    });
  const option = {
    tooltip: {
      position: "top",
    },
    grid: {
      height: "50%",
      top: "10%",
    },
    xAxis: {
      type: "category",
      data: hours,
      splitArea: {
        show: true,
      },
    },
    yAxis: {
      type: "category",
      data: days,
      splitArea: {
        show: true,
      },
    },
    visualMap: {
      min: 0,
      max: 10,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "15%",
    },
    series: [
      {
        name: "Punch Card",
        type: "heatmap",
        data: data,
        label: {
          show: true,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  };
  return renderEChart(option, width, height);
};

export const renderSankey = ({ width = 600, height = 400 } = {}) => {
  const option = {
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
    },
    animation: false,
    series: [
      {
        type: "sankey",
        bottom: "10%",
        emphasis: {
          focus: "adjacency",
        },
        data: [
          { name: "a" },
          { name: "b" },
          { name: "a1" },
          { name: "b1" },
          { name: "c" },
          { name: "e" },
        ],
        links: [
          { source: "a", target: "a1", value: 5 },
          { source: "e", target: "b", value: 3 },
          { source: "a", target: "b1", value: 3 },
          { source: "b1", target: "a1", value: 1 },
          { source: "b1", target: "c", value: 2 },
          { source: "b", target: "c", value: 1 },
        ],
        orient: "vertical",
        label: {
          position: "top",
        },
        lineStyle: {
          color: "source",
          curveness: 0.5,
        },
      },
    ],
  };
  return renderEChart(option, width, height);
};

export const renderMap = ({ width = 600, height = 400 } = {}) => {
  echarts.registerMap("USA", mapData, {
    Alaska: {
      left: -131,
      top: 25,
      width: 15,
    },
    Hawaii: {
      left: -110,
      top: 28,
      width: 5,
    },
    "Puerto Rico": {
      left: -76,
      top: 26,
      width: 2,
    },
  });

  const option = {
    title: {
      text: "USA Population Estimates (2012)",
      subtext: "Data from www.census.gov",
      sublink: "http://www.census.gov/popest/data/datasets.html",
      left: "right",
    },
    tooltip: {
      trigger: "item",
      showDelay: 0,
      transitionDuration: 0.2,
    },
    visualMap: {
      left: "right",
      min: 500000,
      max: 38000000,
      inRange: {
        color: [
          "#313695",
          "#4575b4",
          "#74add1",
          "#abd9e9",
          "#e0f3f8",
          "#ffffbf",
          "#fee090",
          "#fdae61",
          "#f46d43",
          "#d73027",
          "#a50026",
        ],
      },
      text: ["High", "Low"],
      calculable: true,
    },
    toolbox: {
      show: true,
      //orient: 'vertical',
      left: "left",
      top: "top",
      feature: {
        dataView: { readOnly: false },
        restore: {},
        saveAsImage: {},
      },
    },
    series: [
      {
        name: "USA PopEstimates",
        type: "map",
        roam: true,
        map: "USA",
        emphasis: {
          label: {
            show: true,
          },
        },
        data: [
          { name: "Alabama", value: 4822023 },
          { name: "Alaska", value: 731449 },
          { name: "Arizona", value: 6553255 },
          { name: "Arkansas", value: 2949131 },
          { name: "California", value: 38041430 },
          { name: "Colorado", value: 5187582 },
          { name: "Connecticut", value: 3590347 },
          { name: "Delaware", value: 917092 },
          { name: "District of Columbia", value: 632323 },
          { name: "Florida", value: 19317568 },
          { name: "Georgia", value: 9919945 },
          { name: "Hawaii", value: 1392313 },
          { name: "Idaho", value: 1595728 },
          { name: "Illinois", value: 12875255 },
          { name: "Indiana", value: 6537334 },
          { name: "Iowa", value: 3074186 },
          { name: "Kansas", value: 2885905 },
          { name: "Kentucky", value: 4380415 },
          { name: "Louisiana", value: 4601893 },
          { name: "Maine", value: 1329192 },
          { name: "Maryland", value: 5884563 },
          { name: "Massachusetts", value: 6646144 },
          { name: "Michigan", value: 9883360 },
          { name: "Minnesota", value: 5379139 },
          { name: "Mississippi", value: 2984926 },
          { name: "Missouri", value: 6021988 },
          { name: "Montana", value: 1005141 },
          { name: "Nebraska", value: 1855525 },
          { name: "Nevada", value: 2758931 },
          { name: "New Hampshire", value: 1320718 },
          { name: "New Jersey", value: 8864590 },
          { name: "New Mexico", value: 2085538 },
          { name: "New York", value: 19570261 },
          { name: "North Carolina", value: 9752073 },
          { name: "North Dakota", value: 699628 },
          { name: "Ohio", value: 11544225 },
          { name: "Oklahoma", value: 3814820 },
          { name: "Oregon", value: 3899353 },
          { name: "Pennsylvania", value: 12763536 },
          { name: "Rhode Island", value: 1050292 },
          { name: "South Carolina", value: 4723723 },
          { name: "South Dakota", value: 833354 },
          { name: "Tennessee", value: 6456243 },
          { name: "Texas", value: 26059203 },
          { name: "Utah", value: 2855287 },
          { name: "Vermont", value: 626011 },
          { name: "Virginia", value: 8185867 },
          { name: "Washington", value: 6897012 },
          { name: "West Virginia", value: 1855413 },
          { name: "Wisconsin", value: 5726398 },
          { name: "Wyoming", value: 576412 },
          { name: "Puerto Rico", value: 3667084 },
        ],
      },
    ],
  };
  return renderEChart(option, width, height);
};
