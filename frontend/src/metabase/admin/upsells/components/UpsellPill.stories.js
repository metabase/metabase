import { ReduxProvider } from "__support__/storybook";
import { Box } from "metabase/ui";

import { _UpsellPill } from "./UpsellPill";

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

const DefaultTemplate = args => (
  <ReduxProvider>
    <Box>
      <_UpsellPill {...args} />
    </Box>
  </ReduxProvider>
);

const NarrowTemplate = args => (
  <ReduxProvider>
    <Box style={{ maxWidth: "10rem" }}>
      <_UpsellPill {...args} />
    </Box>
  </ReduxProvider>
);

export default {
  title: "Upsells/Pill",
  component: _UpsellPill,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  name: "Default",
};

export const Multiline = {
  render: NarrowTemplate,
  name: "Multiline",
};
