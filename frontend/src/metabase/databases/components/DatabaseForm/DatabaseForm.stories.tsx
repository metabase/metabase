import React from "react";
import type { ComponentStory } from "@storybook/react";
import { createMockEngine } from "metabase-types/api/mocks";
import DatabaseForm from "./DatabaseForm";

export default {
  title: "Databases/DatabaseForm",
  component: DatabaseForm,
};

const Template: ComponentStory<typeof DatabaseForm> = args => {
  return <DatabaseForm {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  engines: {
    presto: createMockEngine({
      "driver-name": "Presto (Deprecated Driver)",
      "superseded-by": "presto-jdbc",
    }),
    "presto-jdbc": createMockEngine({
      "driver-name": "Presto",
    }),
  },
};
