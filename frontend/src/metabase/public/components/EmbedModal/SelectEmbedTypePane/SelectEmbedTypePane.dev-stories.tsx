/* eslint-disable i18next/no-literal-string */
/* eslint-disable import/no-default-export*/
import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
import type { ChangeEvent } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import Alert from "metabase/common/components/Alert";
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";
import { Box, Stack, Switch, Text } from "metabase/ui";
import {
  createMockDashboard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SelectEmbedTypePane } from "./SelectEmbedTypePane";

function isEnterprisePluginsEnabled() {
  return window.localStorage.getItem("enterprise-plugins-enabled") === "true";
}

function setEnterprisePluginsEnabled(enabled: boolean) {
  window.localStorage.setItem("enterprise-plugins-enabled", enabled.toString());
}

function _EnterprisePluginsToggle() {
  const isEnterprise = isEnterprisePluginsEnabled();
  function onSwitchChanged(event: ChangeEvent<HTMLInputElement>) {
    setEnterprisePluginsEnabled(event.currentTarget.checked);
    window.location.reload();
  }
  return (
    <Box mt="md">
      <Switch
        mt="sm"
        label={
          isEnterprise
            ? `Enterprise features enabled`
            : `Enterprise features disabled`
        }
        description="This toggle will store the state in localStorage and reload the page. This is far from ideal solution, but it enables testing enterprise features in the Storybook."
        onChange={onSwitchChanged}
        checked={isEnterprise}
      />
    </Box>
  );
}

function EnterprisePluginsInfo() {
  const isEnterprise = PLUGIN_IS_EE_BUILD.isEEBuild();
  return (
    <Alert icon="warning" variant="warning">
      <Text>
        {" "}
        This <strong>{isEnterprise ? "IS" : "IS NOT"}</strong> enterprise build.
      </Text>
    </Alert>
  );
}

function EnterpriseToggleDecorator(
  Story: StoryFn,
  { parameters }: { parameters: { isEnterprise: boolean } },
) {
  const { isEnterprise } = parameters;
  if (isEnterprise) {
    setupEnterprisePlugins();
  }
  if (PLUGIN_IS_EE_BUILD.isEEBuild() !== isEnterprise) {
    window.location.reload();
  }

  return (
    <div>
      <Stack gap="md">
        <Story />
        <EnterprisePluginsInfo />
      </Stack>
    </div>
  );
}

export default {
  title: "SelectEmbedTypePane",
  component: SelectEmbedTypePane,
  parameters: {
    layout: "centered",
  },
  decorators: [EnterpriseToggleDecorator],
};

const Template: StoryFn<typeof SelectEmbedTypePane> = (args) => {
  return <SelectEmbedTypePane {...args} />;
};

export const EmbeddingNotAvailableOss = Template.bind({});
EmbeddingNotAvailableOss.args = {
  resource: createMockDashboard({
    public_uuid: "mock-uuid",
    enable_embedding: false,
  }),
  resourceType: "dashboard",
  goToNextStep: action("next step"),
  getPublicUrl: () => "https://example.com",
  onDeletePublicLink: action("delete"),
  onCreatePublicLink: action("create"),
};
EmbeddingNotAvailableOss.parameters = {
  isEnterprise: false,
};

export const EmbeddingNotAvailableEE = Template.bind({});
EmbeddingNotAvailableEE.args = {
  resource: createMockDashboard({
    public_uuid: "mock-uuid",
    enable_embedding: false,
  }),
  resourceType: "dashboard",
  goToNextStep: action("next step"),
  getPublicUrl: () => "https://example.com",
  onDeletePublicLink: action("delete"),
  onCreatePublicLink: action("create"),
};

EmbeddingNotAvailableEE.parameters = {
  isEnterprise: true,
};

export const EmbeddingAvailableNotEnabled = Template.bind({});
EmbeddingAvailableNotEnabled.args = {
  resource: createMockDashboard({
    public_uuid: "mock-uuid",
    enable_embedding: false,
  }),
  resourceType: "dashboard",
  goToNextStep: action("next step"),
  getPublicUrl: () => "https://example.com",
  onDeletePublicLink: action("delete"),
  onCreatePublicLink: action("create"),
};

EmbeddingAvailableNotEnabled.parameters = {
  state: createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        embedding: true,
      }),
    }),
  }),
  isEnterprise: true,
};

export const EmbeddingAvailableAndEnabled = Template.bind({});
EmbeddingAvailableAndEnabled.args = {
  resource: createMockDashboard({
    public_uuid: "mock-uuid",
    enable_embedding: false,
  }),
  resourceType: "dashboard",
  goToNextStep: action("next step"),
  getPublicUrl: () => "https://example.com",
  onDeletePublicLink: action("delete"),
  onCreatePublicLink: action("create"),
};

EmbeddingAvailableAndEnabled.parameters = {
  state: createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        embedding: true,
      }),
      "enable-embedding-interactive": true,
    }),
  }),
  isEnterprise: true,
};
