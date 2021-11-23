import React from "react";
import { Box } from "grid-styled";
import Heading from "metabase/components/type/Heading";
import Subhead from "metabase/components/type/Subhead";
import { XYChart } from "metabase/static-viz/components/XYChart";

const BAR_TIME_SERIES_1 = {
  name: "bar series 1 with a really really really really long name",
  color: "#88bf4d",
  yAxisPosition: "left",
  type: "bar",
  data: [
    ["2020-01-01", 210],
    ["2020-02-01", 40],
    ["2020-03-01", 50],
    ["2021-04-01", 40],
    ["2021-05-01", 34],
    ["2021-06-01", 21],
    ["2021-07-01", 54],
  ],
};

const BAR_TIME_SERIES_2 = {
  name: "bar series 2",
  color: "#a989c5",
  yAxisPosition: "right",
  type: "bar",
  data: [
    ["2020-01-01", 101],
    ["2020-02-01", 60],
    ["2020-03-01", 80],
    ["2021-04-01", 70],
    ["2021-05-01", 54],
    ["2021-06-01", 141],
    ["2021-07-01", 234],
  ],
};

const LINE_TIME_SERIES_1 = {
  name: "line series 1 with a really really really really long name",
  color: "#f9d45c",
  yAxisPosition: "left",
  type: "line",
  data: [
    ["2020-01-01", 40],
    ["2020-02-01", 30],
    ["2020-03-01", 20],
    ["2021-04-01", 80],
    ["2021-05-01", 44],
    ["2021-06-01", 51],
    ["2021-07-01", 14],
  ],
};

const AREA_TIME_SERIES_1 = {
  name: "area series 1",
  color: "#509ee3",
  yAxisPosition: "right",
  type: "area",
  data: [
    ["2020-01-01", 80],
    ["2020-02-01", 90],
    ["2020-03-01", 30],
    ["2021-04-01", 120],
    ["2021-05-01", 144],
    ["2021-06-01", 251],
    ["2021-07-01", 214],
  ],
};

const LINE_LINEAR = {
  name: "line linear series",
  color: "#f9d45c",
  yAxisPosition: "left",
  type: "line",
  data: [[1, 40], [2, 30], [3, 20], [4, 80], [5, 44], [6, 51], [7, 14]],
};

const BAR_LINEAR = {
  name: "bar linear series",
  color: "#88bf4d",
  yAxisPosition: "left",
  type: "bar",
  data: [[1, 48], [2, 21], [3, 10], [4, 20], [5, 34], [6, 51], [7, 14]],
};

const AREA_LINEAR = {
  name: "bar linear series",
  color: "#509ee3",
  yAxisPosition: "left",
  type: "area",
  data: [[1, 1], [2, 100], [3, 90], [4, 80], [5, 70], [6, 60], [7, 50]],
};

const LINE_ORDINAL = {
  name: "line series 1 with a really really really really long name",
  color: "#f9d45c",
  yAxisPosition: "left",
  type: "line",
  data: [
    ["Stage 1", 40],
    ["Stage 2", 30],
    ["Stage 3", 20],
    ["Stage 4", 80],
    ["Stage 5", 44],
    ["Stage 6", 51],
    ["Stage 7", 14],
    ["Stage 8", 44],
    ["Stage 9", 51],
    ["Stage 10", 14],
    ["Stage 11", 14],
  ],
};

export default function XYChartPage() {
  return (
    <Box py={4}>
      <Box className="wrapper wrapper--trim">
        <Heading>XYChart</Heading>
        {/* <Box py={3}>
          <Subhead>Line/Area/Bar time scale multi-series</Subhead>
          <XYChart
            settings={{
              x: {
                type: "timeseries",
                format: {
                  date_style: "MMM",
                },
              },
              y: {
                type: "linear",
              },
              labels: {
                left: "Left values",
                right: "Right values",
                bottom: "Date",
              },
            }}
            series={[
              BAR_TIME_SERIES_1,
              BAR_TIME_SERIES_2,
              LINE_TIME_SERIES_1,
              AREA_TIME_SERIES_1,
            ]}
          />
        </Box>

        <Box py={3}>
          <Subhead>Line time scale</Subhead>
          <XYChart
            settings={{
              x: {
                type: "timeseries",
                format: {
                  date_style: "MMM",
                },
              },
              y: {
                type: "linear",
              },
              labels: {
                left: "Left values",
                bottom: "Date",
              },
            }}
            series={[
              {
                color: "#f9d45c",
                yAxisPosition: "left",
                type: "line",
                name: "something",
                data: [
                  ["2020-01-10", 10],
                  ["2020-06-10", 60],
                  ["2020-12-10", 80],
                ],
              },
            ]}
          />
        </Box>

        <Box py={3}>
          <Subhead>Line time scale</Subhead>
          <XYChart
            settings={{
              x: {
                type: "timeseries",
                format: {
                  date_style: "MMM",
                },
              },
              y: {
                type: "linear",
              },
              labels: {
                left: "Left values",
                bottom: "Date",
              },
            }}
            series={[LINE_TIME_SERIES_1]}
          />
        </Box>
        <Box py={3}>
          <Subhead>Area time scale</Subhead>
          <XYChart
            settings={{
              x: {
                type: "timeseries",
                format: {
                  date_style: "MMM",
                },
              },
              y: {
                type: "linear",
              },
              labels: {
                left: "Left values",
                bottom: "Date",
              },
            }}
            series={[AREA_TIME_SERIES_1]}
          />
        </Box>
        <Box py={3}>
          <Subhead>Bar time scale</Subhead>
          <XYChart
            settings={{
              x: {
                type: "timeseries",
                format: {
                  date_style: "MMM",
                },
              },
              y: {
                type: "linear",
              },
              labels: {
                left: "Left values",
                bottom: "Date",
              },
            }}
            series={[BAR_TIME_SERIES_1]}
          />
        </Box>

        <Box py={3}>
          <Subhead>Line/Area/Bar linear scale multi-series</Subhead>
          <XYChart
            settings={{
              x: {
                type: "linear",
              },
              y: {
                type: "linear",
              },
              labels: {
                left: "Left values",
                bottom: "Date",
              },
            }}
            series={[LINE_LINEAR, BAR_LINEAR, AREA_LINEAR]}
          />
        </Box> */}

        <Box py={3}>
          <Subhead>Line ordinal</Subhead>
          <XYChart
            settings={{
              x: {
                tick_display: "rotate-45",
                type: "ordinal",
              },
              y: {
                type: "linear",
              },
              labels: {
                left: "Left values",
                bottom: "Date",
              },
            }}
            series={[LINE_ORDINAL]}
          />
        </Box>
      </Box>
    </Box>
  );
}
