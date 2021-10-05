import React from "react";
import { Box } from "grid-styled";
import Heading from "metabase/components/type/Heading";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";
import StaticChart from "metabase/static-viz/containers/StaticChart";

export default function StaticVizPage() {
  return (
    <Box py={4}>
      <Box className="wrapper wrapper--trim">
        <Heading>Static Visualisations</Heading>
        <Text>
          These visualizations are used in dashboard subscriptions. They have no
          interactivity and get generated by the backend to be sent to Slack or
          in emails. You can use this playground to work on the source code in
          /static-viz/ and see the effects. You might need to hard refresh to
          see updates.
        </Text>
        <Box py={3}>
          <Subhead>Line chart with timeseries data</Subhead>
          <StaticChart
            type="timeseries/line"
            options={{
              data: [
                ["2020-01-10", 10],
                ["2020-06-10", 60],
                ["2020-12-10", 80],
              ],
              accessors: {
                x: row => new Date(row[0]).valueOf(),
                y: row => row[1],
              },
              labels: {
                left: "Count",
                bottom: "Created At",
              }
            }}
          />
        </Box>
        <Box py={3}>
          <Subhead>Area chart with timeseries data</Subhead>
          <StaticChart
            type="timeseries/area"
            options={{
              data: [
                ["2020-01-10", 10],
                ["2020-06-10", 60],
                ["2020-12-10", 80],
              ],
              accessors: {
                x: row => new Date(row[0]).valueOf(),
                y: row => row[1],
              },
              settings: {
                x: {
                  date_style: "MMM",
                },
              },
              labels: {
                left: "Count",
                bottom: "Created At",
              },
              colors: {
                brand: "#88BF4D",
              },
            }}
          />
        </Box>
        <Box py={3}>
          <Subhead>Bar chart with timeseries data</Subhead>
          <StaticChart
            type="timeseries/bar"
            options={{
              data: [
                ["2020-10-21", 20],
                ["2020-10-22", 30],
                ["2020-10-23", 25],
                ["2020-10-24", 10],
                ["2020-10-25", 15],
              ],
              accessors: {
                x: row => new Date(row[0]).valueOf(),
                y: row => row[1],
              },
              settings: {
                x: {
                  date_style: "MM/DD/YYYY",
                },
                y: {
                  number_style: "currency",
                  currency: "USD",
                  currency_style: "symbol",
                  decimals: 0,
                },
              },
              labels: {
                left: "Price",
                bottom: "Created At",
              },
            }}
          />
        </Box>

        <Box py={3}>
          <Subhead>Line chart with categorical data</Subhead>
          <StaticChart
            type="categorical/line"
            options={{
              data: [
                ["Alden Sparks", 70],
                ["Areli Guerra", 30],
                ["Arturo Hopkins", 80],
                ["Beatrice Lane", 120],
                ["Brylee Davenport", 100],
                ["Cali Nixon", 60],
                ["Dane Terrell", 150],
                ["Deshawn Rollins", 40],
                ["Isabell Bright", 70],
                ["Kaya Rowe", 20],
                ["Roderick Herman", 50],
                ["Ruth Dougherty", 75],
              ],
              accessors: {
                x: row => row[0],
                y: row => row[1],
              },
              labels: {
                left: "Tasks",
                bottom: "People",
              },
            }}
          />
        </Box>
        <Box py={3}>
          <Subhead>Area chart with categorical data</Subhead>
          <StaticChart
            type="categorical/area"
            options={{
              data: [
                ["Alden Sparks", 70],
                ["Areli Guerra", 30],
                ["Arturo Hopkins", 80],
                ["Beatrice Lane", 120],
                ["Brylee Davenport", 100],
                ["Cali Nixon", 60],
                ["Dane Terrell", 150],
                ["Deshawn Rollins", 40],
                ["Isabell Bright", 70],
                ["Kaya Rowe", 20],
                ["Roderick Herman", 50],
                ["Ruth Dougherty", 75],
              ],
              accessors: {
                x: row => row[0],
                y: row => row[1],
              },
              labels: {
                left: "Tasks",
                bottom: "People",
              },
            }}
          />
        </Box>
        <Box py={3}>
          <Subhead>Bar chart with categorical data</Subhead>
          <StaticChart
            type="categorical/bar"
            options={{
              data: [
                ["Alden Sparks", 70],
                ["Areli Guerra", 30],
                ["Arturo Hopkins", 80],
                ["Beatrice Lane", 120],
                ["Brylee Davenport", 100],
                ["Cali Nixon", 60],
                ["Dane Terrell", 150],
                ["Deshawn Rollins", 40],
                ["Isabell Bright", 70],
                ["Kaya Rowe", 20],
                ["Roderick Herman", 50],
                ["Ruth Dougherty", 75],
              ],
              accessors: {
                x: row => row[0],
                y: row => row[1],
              },
              labels: {
                left: "Tasks",
                bottom: "People",
              },
            }}
          />
        </Box>
        <Box py={3}>
          <Subhead>Donut chart with categorical data</Subhead>
          <StaticChart
            type="categorical/donut"
            options={{
              data: [["donut", 2000], ["cronut", 3100]],
              colors: {
                donut: "#509EE3",
                cronut: "#DDECFA",
              },
              accessors: {
                dimension: row => row[0],
                metric: row => row[1],
              },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
