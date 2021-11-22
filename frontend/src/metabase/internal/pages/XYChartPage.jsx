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
                left: "Left values",
                right: "Right values",
                bottom: "Date",
              },
            }}
            series={[
              {
                name:
                  "bar series 1 with a really really really really long name",
                color: "#88bf4d",
                yAxisPosition: "left",
                type: "bar",
                data: [
                  ["2020-01-01", 2100],
                  ["2020-02-01", 40],
                  ["2020-03-01", 50],
                  ["2021-04-01", 40],
                  ["2021-05-01", 34],
                  ["2021-06-01", 21],
                  ["2021-07-01", 54],
                ],
              },
              {
                name: "bar series 2",
                color: "#a989c5",
                yAxisPosition: "left",
                type: "bar",
                data: [
                  ["2020-01-01", 1011],
                  ["2020-02-01", 60],
                  ["2020-03-01", 80],
                  ["2021-04-01", 70],
                  ["2021-05-01", 54],
                  ["2021-06-01", 141],
                  ["2021-07-01", 234],
                ],
              },
              {
                name:
                  "line series 1 with a really really really really long name",
                color: "#f9d45c",
                yAxisPosition: "right",
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
              },
              {
                name: "area series 1",
                color: "#885ab1",
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
              },
            ]}
          />
        </Box>
      </Box>
    </Box>
  );
}
