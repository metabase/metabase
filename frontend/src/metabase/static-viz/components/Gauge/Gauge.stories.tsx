import type { StoryFn } from "@storybook/react-webpack5";

import { color } from "metabase/lib/colors";
import GaugeContainer, {
  type GaugeContainerProps,
} from "metabase/static-viz/components/Gauge/GaugeContainer";
import {
  DEFAULT,
  TRUNCATED_LABELS,
  WITH_FORMATTING,
} from "metabase/static-viz/components/Gauge/stories-data";

export default {
  title: "Viz/Static Viz/Gauge",
  component: GaugeContainer,
};

const Template: StoryFn<GaugeContainerProps> = (args) => {
  return <GaugeContainer {...args} />;
};

export const Default = {
  render: Template,
  args: { ...DEFAULT, getColor: color },
};

export const WithFormatting = {
  render: Template,
  args: { ...WITH_FORMATTING, getColor: color },
};

export const TruncatedLabels = {
  render: Template,
  args: { ...TRUNCATED_LABELS, getColor: color },
};

export const Watermark = {
  render: Template,
  args: { ...DEFAULT, getColor: color, hasDevWatermark: true },
};
