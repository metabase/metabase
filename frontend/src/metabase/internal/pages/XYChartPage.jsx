import React from "react";
import { Box } from "grid-styled";
import Heading from "metabase/components/type/Heading";
import Subhead from "metabase/components/type/Subhead";
import { XYChart } from "metabase/static-viz/components/XYChart";

export default function XYChartPage() {
  return (
    <Box py={4}>
      <Box className="wrapper wrapper--trim">
        <Heading>XYChart</Heading>
        <Box py={3}>
          <Subhead>Line/Area/Bar multi-series combined</Subhead>
          <XYChart
            settings={{
              yAxisType: "linear",
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
                left: "Values",
                bottom: "Date",
              },
            }}
            series={[
              {
                name: "bar series 1",
                color: "#88bf4d",
                yAxisPosition: "left",
                type: "bar",
                data: [
                  ["2020-01-10", -20],
                  ["2020-02-10", -40],
                  ["2020-03-10", 50],
                  ["2021-04-10", 40],
                  ["2021-05-10", 34],
                  ["2021-06-10", 21],
                  ["2021-07-10", 54],
                ],
              },
              {
                name: "bar series 2",
                color: "#a989c5",
                yAxisPosition: "left",
                type: "bar",
                data: [
                  ["2020-01-10", 10],
                  ["2020-02-10", -60],
                  ["2020-03-10", 80],
                  ["2021-04-10", 70],
                  ["2021-05-10", -54],
                  ["2021-06-10", -141],
                  ["2021-07-10", 234],
                ],
              },
              {
                name: "bar series 3",
                color: "#ef8c8c",
                yAxisPosition: "left",
                type: "bar",
                data: [
                  ["2020-01-10", 90],
                  ["2020-02-10", 110],
                  ["2020-03-10", -180],
                  ["2021-04-10", 280],
                  ["2021-05-10", 24],
                  ["2021-06-10", -31],
                  ["2021-07-10", 54],
                ],
              },
              {
                name: "line series 1",
                color: "#f9d45c",
                yAxisPosition: "left",
                type: "line",
                data: [
                  ["2020-01-10", 40],
                  ["2020-02-10", -30],
                  ["2020-03-10", 20],
                  ["2021-04-10", 80],
                  ["2021-05-10", 44],
                  ["2021-06-10", 51],
                  ["2021-07-10", 14],
                ],
              },
              {
                name: "line series 2",
                color: "#f2a86f",
                yAxisPosition: "left",
                type: "line",
                data: [
                  ["2020-01-10", 120],
                  ["2020-02-10", 0],
                  ["2020-03-10", 40],
                  ["2021-04-10", 180],
                  ["2021-05-10", 244],
                  ["2021-06-10", 151],
                  ["2021-07-10", 114],
                ],
              },
              {
                name: "area series 1",
                color: "#885ab1",
                yAxisPosition: "left",
                type: "area",
                data: [
                  ["2020-01-10", 80],
                  ["2020-02-10", 90],
                  ["2020-03-10", 30],
                  ["2021-04-10", -120],
                  ["2021-05-10", 144],
                  ["2021-06-10", 251],
                  ["2021-07-10", 214],
                ],
              },
              {
                name: "area series 2",
                color: "#2d86d4",
                yAxisPosition: "left",
                type: "area",
                data: [
                  ["2020-01-10", -180],
                  ["2020-02-10", -20],
                  ["2020-03-10", -80],
                  ["2021-04-10", -20],
                  ["2021-05-10", -99],
                  ["2021-06-10", -54],
                  ["2021-07-10", 100],
                ],
              },
            ]}
          />
        </Box>
      </Box>
    </Box>
  );
}
