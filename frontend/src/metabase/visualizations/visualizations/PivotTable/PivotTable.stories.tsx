import type { Story } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
} from "__support__/storybook";

import { PivotTable } from "./PivotTable";
import { PivotTableTestWrapper } from "./pivot-table-test-mocks";
import { HORIZONTAL_SCROLL_43215 } from "./stories-data";

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
      <PivotTableTestWrapper
        data={HORIZONTAL_SCROLL_43215.data}
        initialSettings={HORIZONTAL_SCROLL_43215.initialSettings}
      />
    </VisualizationWrapper>
  );
};
