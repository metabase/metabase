/* eslint-disable i18next/no-literal-string */
/* eslint-disable import/no-default-export*/
import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
/* eslint-disable-next-line no-restricted-imports */
import { fn } from "@storybook/test";
import type { ChangeEvent } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import Alert from "metabase/common/components/Alert";
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";
import { Box, Stack, Switch, Text } from "metabase/ui";

import { LicenseTokenForm } from "./LicenseTokenForm";

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
        This <strong>{isEnterprise ? "IS" : "IS NOT"}</strong> enterprise build
        (from the FE perspective).
      </Text>
    </Alert>
  );
}

function EnterpriseToggleDecorator(
  Story: StoryFn,
  { parameters }: { parameters: { isEnterprise?: boolean } },
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
  title: "LicenseTokenForm",
  component: LicenseTokenForm,
  parameters: {
    layout: "centered",
    isEnterprise: false,
  },
  decorators: [EnterpriseToggleDecorator],
};

const Template: StoryFn<typeof LicenseTokenForm> = (args) => {
  return <LicenseTokenForm {...args} />;
};

export const LicenseTokenFormStory = Template.bind({});
LicenseTokenFormStory.args = {
  onSubmit: fn((token) => token).mockResolvedValue(undefined),
  onSkip: action("onSkip"),
};
LicenseTokenFormStory.parameters = {
  isEnterprise: false,
};
