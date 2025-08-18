/* eslint-disable i18next/no-literal-string */
/* eslint-disable import/no-default-export*/
import type { StoryFn } from "@storybook/react";
import { HttpResponse, http } from "msw";
import type { ChangeEvent } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { useGetSessionPropertiesQuery } from "metabase/api";
import Alert from "metabase/common/components/Alert";
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";
import { Box, Stack, Switch, Text } from "metabase/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { AppBanner } from "./AppBanner";

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

function SessionPropertiesLoader(Story: StoryFn) {
  useGetSessionPropertiesQuery();
  return <Story />;
}

export default {
  title: "AppBanner",
  component: AppBanner,
  parameters: {
    layout: "centered",
    isEnterprise: false,
  },
  decorators: [EnterpriseToggleDecorator, SessionPropertiesLoader],
};

const Template: StoryFn<typeof AppBanner> = () => {
  return <AppBanner />;
};

let data: null | string[] = null;

export const AppBannerStory = Template.bind({});

AppBannerStory.args = {};
AppBannerStory.parameters = {
  state: createMockState({
    settings: mockSettings({
      "site-name": "Basemeta",
      "store-url": "https://test-store.metabase.com",
      "license-token-missing-banner-dismissal-timestamp": [],
    }),
    currentUser: createMockUser({
      is_superuser: true,
    }),
  }),
  isEnterprise: true,
  msw: {
    handlers: [
      http.get("/api/session/properties", () => {
        return HttpResponse.json(
          {
            ...mockSettings({
              "site-name": "Basemeta",
              "store-url": "https://test-store.metabase.com",
              "license-token-missing-banner-dismissal-timestamp": data ?? [],
            }).values,
          },
          { status: 200 },
        );
      }),
      http.put(
        "/api/setting/license-token-missing-banner-dismissal-timestamp",
        async (request) => {
          const requestBody = await request.request.json();
          data =
            typeof requestBody === "object" &&
            requestBody !== null &&
            "value" in requestBody
              ? requestBody.value
              : null;
          return HttpResponse.json(null, { status: 204 });
        },
      ),
    ],
  },
};

export const AppBannerStoryError = Template.bind({});
AppBannerStoryError.args = {};
AppBannerStoryError.parameters = {
  state: createMockState({
    settings: mockSettings({
      "site-name": "Basemeta",
      "store-url": "https://test-store.metabase.com",
    }),
    currentUser: createMockUser({
      is_superuser: true,
    }),
  }),
  isEnterprise: true,
  msw: {
    handlers: [
      http.put(
        "/api/setting/license-token-missing-banner-dismissal-timestamp",
        () => {
          return HttpResponse.json(null, { status: 500 });
        },
      ),
    ],
  },
};
