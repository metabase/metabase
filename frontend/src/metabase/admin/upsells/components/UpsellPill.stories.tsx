import type { ComponentProps } from "react";
import { action } from "storybook/actions";

import { ReduxProvider } from "__support__/storybook";
import { Box } from "metabase/ui";

import { UpsellPillInner } from "./UpsellPill";

const args = {
  children: "Metabase Enterprise is so great",
  link: "https://www.metabase.com",
  campaign: "enterprise",
  source: "enterprise-page-footer",
};

const argTypes = {
  children: {
    control: { type: "text" },
  },
  link: {
    control: { type: "text" },
  },
  campaign: {
    control: { type: "text" },
  },
  source: {
    control: { type: "text" },
  },
};

type UpsellPillProps = ComponentProps<typeof UpsellPillInner>;

const DefaultTemplate = (args: UpsellPillProps) => (
  <ReduxProvider>
    <Box>
      <UpsellPillInner {...args} />
    </Box>
  </ReduxProvider>
);

const NarrowTemplate = (args: UpsellPillProps) => (
  <ReduxProvider>
    <Box style={{ maxWidth: "10rem" }}>
      <UpsellPillInner {...args} />
    </Box>
  </ReduxProvider>
);

export default {
  title: "Patterns/Upsells/Pill",
  component: UpsellPillInner,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const WithOnClick = {
  render: DefaultTemplate,
  args: {
    ...args,
    onClick: action("clicked"),
  },
};

export const Multiline = {
  render: NarrowTemplate,
};
