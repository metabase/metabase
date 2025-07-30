import type { StoryFn } from "@storybook/react-webpack5";

import {
  createMockEngine,
  createMockEngineSource,
} from "metabase-types/api/mocks";

import DatabaseEngineWarning, {
  type DatabaseEngineWarningProps,
} from "./DatabaseEngineWarning";

export default {
  title: "App/Databases/DatabaseEngineWarning",
  component: DatabaseEngineWarning,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: StoryFn<DatabaseEngineWarningProps> = (args) => {
  return <DatabaseEngineWarning {...args} />;
};
Template.args = {
  engines: {
    presto: createMockEngine({
      "driver-name": "Presto (Deprecated Driver)",
      "superseded-by": "presto-jdbc",
      source: createMockEngineSource({
        type: "official",
      }),
    }),
    "presto-jdbc": createMockEngine({
      "driver-name": "Presto",
      source: createMockEngineSource({
        type: "official",
      }),
    }),
    communityEngine: createMockEngine({
      "driver-name": "CommunityEngine",
      source: createMockEngineSource({
        type: "community",
      }),
    }),
  },
};

export const New = {
  render: Template,

  args: {
    engineKey: "presto-jdbc",
    ...Template.args,
  },
};

export const Deprecated = {
  render: Template,

  args: {
    engineKey: "presto",
    ...Template.args,
  },
};

export const Community = {
  render: Template,

  args: {
    engineKey: "communityEngine",
    ...Template.args,
  },
};
