import type { ComponentStory } from "@storybook/react";

import { getStore } from "__support__/entities-store";
import { TestWrapper } from "__support__/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";

import { SmartScalar } from "./SmartScalar";
import { mockSeries } from "./test-mocks";

export default {
  title: "visualizations/SmartScalar",
  component: SmartScalar,
};

// @ts-expect-error: SmartScalar is not written in TypeScript yet.
registerVisualization(SmartScalar);

const rows = [
  ["2019-10-01T00:00:00", 100],
  ["2019-11-01T00:00:00", 120],
];

const MOCK_SERIES = mockSeries({
  rows,
  insights: [{ unit: "month", col: "Count" }],
});

const Template: ComponentStory<typeof SmartScalar> = () => {
  const store = getStore();

  return (
    <TestWrapper store={store} withRouter={false} withKBar={false} withDND>
      <Visualization rawSeries={MOCK_SERIES} width={500} />
    </TestWrapper>
  );
};

export const Default = Template.bind({});

Default.args = {};
