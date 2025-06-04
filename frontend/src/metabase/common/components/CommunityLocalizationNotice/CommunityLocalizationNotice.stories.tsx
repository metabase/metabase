import type { Meta, StoryContext, StoryFn } from "@storybook/react";
import type { ChangeEvent } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { ReduxProvider } from "__support__/storybook";
import { Box, Stack, Switch } from "metabase/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import {
  CommunityLocalizationNotice,
  type CommunityLocalizationNoticeProps,
} from "./CommunityLocalizationNotice";

type TemplateProps = CommunityLocalizationNoticeProps & {
  isWhiteLabeling: boolean;
};

function getState(isWhiteLabeling: boolean) {
  return createMockState({
    settings: mockSettings({
      "application-name": isWhiteLabeling ? "Basemeta" : "Metabase",
      "token-features": createMockTokenFeatures({
        whitelabel: isWhiteLabeling,
      }),
      "show-metabase-links": !isWhiteLabeling,
    }),
  });
}

function isEnterprisePluginsEnabled() {
  return window.localStorage.getItem("enterprise-plugins-enabled") === "true";
}

function setEnterprisePluginsEnabled(enabled: boolean) {
  window.localStorage.setItem("enterprise-plugins-enabled", enabled.toString());
}

function EnterprisePluginsToggle() {
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

function ReduxDecorator(Story: StoryFn, context: StoryContext<TemplateProps>) {
  const loadEnterprise =
    isEnterprisePluginsEnabled() && context.args.isWhiteLabeling;
  const state = getState(loadEnterprise);
  if (loadEnterprise) {
    setupEnterprisePlugins();
  }

  return (
    <div>
      <ReduxProvider storeInitialState={state}>
        <Stack gap="md">
          <Story />
          <EnterprisePluginsToggle />
        </Stack>
      </ReduxProvider>
    </div>
  );
}

export default {
  title: "Localization/CommunityLocalizationNotice",
  component: CommunityLocalizationNotice,
  decorators: [ReduxDecorator],
  tags: ["autodocs"],
} satisfies Meta<TemplateProps>;

const Template: StoryFn<TemplateProps> = ({
  isWhiteLabeling,
  ...args
}: TemplateProps) => {
  return <CommunityLocalizationNotice {...args} />;
};

export const Default = {
  render: Template,
  args: {
    isAdminView: false,
    isWhiteLabeling: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "No white labeling, no admin view. We should display Metabase name and link to the community translations.",
      },
    },
  },
};

export const AdminView = {
  render: Template,
  args: {
    isAdminView: true,
    isWhiteLabeling: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "White labeling, admin view. Since it's an admin view, we should display the original app name and the link to the community translations.",
      },
    },
  },
};

export const WhiteLabeled = {
  render: Template,
  args: {
    isAdminView: false,
    isWhiteLabeling: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "White labeling, no admin view. We shouldn't mention Metabase name, and link to the community translations.",
      },
    },
  },
};
