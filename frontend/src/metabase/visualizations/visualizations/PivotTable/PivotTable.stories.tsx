import type { Story } from "@storybook/react";

import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";

import { PivotTable } from "./PivotTable";
import { PivotTableTestWrapper } from "./pivot-table-test-mocks";

// TODO: waiting for test helpers in [https://github.com/metabase/metabase/pull/42915/files]

export default {
  title: "viz/PivotTable",
  component: PivotTable,
};

export const Default: Story = () => {
  return <PivotTableTestWrapper />;
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
    <SdkThemeProvider theme={theme}>
      <PivotTableTestWrapper />
    </SdkThemeProvider>
  );
};
