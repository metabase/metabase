import React from "react";
import type { ComponentStory } from "@storybook/react";
import { createMockEngine } from "metabase-types/api/mocks";
import DatabaseEngineWarning from "./DatabaseEngineWarning";

export default {
  title: "Databases/DatabaseEngineWarning",
  component: DatabaseEngineWarning,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: ComponentStory<typeof DatabaseEngineWarning> = args => {
  return <DatabaseEngineWarning {...args} />;
};
Template.args = {
  engines: {
    presto: createMockEngine({
      "driver-name": "Presto (Deprecated Driver)",
      "superseded-by": "presto-jdbc",
      source: {
        type: "official",
      },
    }),
    "presto-jdbc": createMockEngine({
      "driver-name": "Presto",
      source: {
        type: "official",
      },
    }),
    communityEngine: createMockEngine({
      "driver-name": "CommunityEngine",
      source: {
        type: "community",
      },
    }),
    partnerEngine: createMockEngine({
      "driver-name": "PartnerEngine",
      source: {
        type: "partner",
        contact: {
          name: "Partners Incorporated",
          address: "https://example.com/contact",
        },
      },
    }),
  },
};

export const New = Template.bind({});
New.args = {
  engine: "presto-jdbc",
  ...Template.args,
};

export const Deprecated = Template.bind({});
Deprecated.args = {
  engine: "presto",
  ...Template.args,
};

export const Community = Template.bind({});
Community.args = {
  engine: "communityEngine",
  ...Template.args,
};

export const Partner = Template.bind({});
Partner.args = {
  engine: "partnerEngine",
  ...Template.args,
};
