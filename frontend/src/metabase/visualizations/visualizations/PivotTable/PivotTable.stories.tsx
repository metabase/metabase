import type { Story } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
} from "__support__/storybook";
import { Box } from "metabase/ui";

import { PivotTable } from "./PivotTable";
import { PivotTableTestWrapper } from "./pivot-table-test-mocks";
import { PIVOT_3_ROWS_NO_COLUMNS } from "./stories-data";

export default {
  title: "viz/PivotTable",
  component: PivotTable,
};

export const Default: Story = () => {
  return (
    <VisualizationWrapper>
      <PivotTableTestWrapper />
    </VisualizationWrapper>
  );
};

export const EmbeddingTheme: Story = () => {
  const theme = {
    colors: {
      border: "#95a5a6",
      background: "#4c5773",
      "background-hover": "#46464b",
    },
    components: {
      table: {
        cell: {
          textColor: "#fff",
          backgroundColor: "#8e44ad",
        },
      },
      pivotTable: {
        rowToggle: {
          textColor: "#fff",
          backgroundColor: "#9b59b6",
        },
      },
    },
  };

  return (
    <SdkVisualizationWrapper theme={theme}>
      <PivotTableTestWrapper />
    </SdkVisualizationWrapper>
  );
};

export const HorizontalScroll43215: Story = () => {
  return (
    <VisualizationWrapper>
      <Box h="400px" w="600px">
        <PivotTableTestWrapper
          data={PIVOT_3_ROWS_NO_COLUMNS.data}
          initialSettings={PIVOT_3_ROWS_NO_COLUMNS.initialSettings}
          isEditing
        />
      </Box>
    </VisualizationWrapper>
  );
};

export const OuterHorizontalScroll: Story = () => {
  return (
    <VisualizationWrapper>
      <Box h="400px" w="320px">
        <PivotTableTestWrapper
          data={PIVOT_3_ROWS_NO_COLUMNS.data}
          initialSettings={PIVOT_3_ROWS_NO_COLUMNS.initialSettings}
          containerWidth
          containerHeight
          isEditing
        />
      </Box>
    </VisualizationWrapper>
  );
};

export const NoOuterHorizontalScroll: Story = () => {
  return (
    <VisualizationWrapper>
      <Box h="400px" w="320px">
        <PivotTableTestWrapper
          data={PIVOT_3_ROWS_NO_COLUMNS.data}
          initialSettings={PIVOT_3_ROWS_NO_COLUMNS.initialSettings}
          containerWidth
          containerHeight
          isEditing
          isDashboard
        />
      </Box>
    </VisualizationWrapper>
  );
};
