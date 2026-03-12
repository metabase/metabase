// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react";
import { useState } from "react";
import { useMount } from "react-use";

import { VisualizationWrapper } from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries, Series } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { RowChart } from "./RowChart";

export default {
  title: "viz/RowChart",
  component: RowChart,
};

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(RowChart);

const MOCK_SERIES = [
  {
    card: createMockCard({ name: "Card", display: "row" }),
    data: {
      cols: [
        StringColumn({ name: "Dimension" }),
        NumberColumn({ name: "Count" }),
      ],
      rows: [
        ["foo", 1],
        ["bar", 2],
      ],
    },
  },
] as Series;

export const Default: StoryFn<{ series: RawSeries }> = ({
  series = MOCK_SERIES,
}: {
  series: RawSeries;
}) => {
  return (
    <VisualizationWrapper>
      <Box h={500}>
        <Visualization rawSeries={series} width={500} />
      </Box>
    </VisualizationWrapper>
  );
};

Default.parameters = {
  loki: { skip: true },
};

export const WithLongNames = () => {
  const [series, setSeries] = useState([
    {
      card: createMockCard({ name: "Card", display: "row" }),
      data: {
        cols: [
          StringColumn({ name: "Dimension" }),
          NumberColumn({ name: "Count" }),
        ],
        rows: [
          [
            "Aerodynamic Bronze HatAerodynamic Bronze HatAerodynamic Bronze HatAerodynamic Bronze HatAerodynamic Bronze HatAerodynamic Bronze HatAerodynamic Bronze Hat",
            1,
          ],
          [
            "Aerodynamic Concrete BenchAerodynamic Concrete BenchAerodynamic Concrete BenchAerodynamic Concrete BenchAerodynamic Concrete BenchAerodynamic Concrete BenchAerodynamic Concrete Bench",
            2,
          ],
        ],
      },
    },
  ] as Series);

  useMount(() => {
    const asyncCallback = createAsyncCallback();

    // trigger rerender to avoid weird issue with first calculation being incorrect. Maybe because of fonts are not loaded?
    setTimeout(() => {
      setSeries([...series]);

      setTimeout(() => {
        asyncCallback();
      });
    }, 100);
  });

  return (
    <VisualizationWrapper>
      <Box h={500}>
        <Visualization rawSeries={series} width={500} />
      </Box>
    </VisualizationWrapper>
  );
};

WithLongNames.parameters = {
  loki: { skip: true },
};
