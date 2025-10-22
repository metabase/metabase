import type { StoryFn } from "@storybook/react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { ReduxProvider } from "__support__/storybook";
import type { EnterpriseSettings } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import MetabotLogo from "./MetabotLogo";

export default {
  title: "App/MetabotLogo",
  component: MetabotLogo,
  decorators: [
    (
      Story: StoryFn,
      { parameters }: { parameters: { initialState: object | undefined } },
    ) => (
      <ReduxProvider
        storeInitialState={getState({
          "token-features": createMockTokenFeatures({
            whitelabel: true,
          }),
          ...parameters.initialState,
        })}
      >
        <Story />
      </ReduxProvider>
    ),
  ],
};

function getState(settings?: Partial<EnterpriseSettings>) {
  return createMockState({
    settings: mockSettings(settings),
  });
}

export const Default = {
  render: () => {
    return <MetabotLogo />;
  },
};

export const CustomizedBrandColor = {
  render: () => {
    setupEnterprisePlugins();
    return <MetabotLogo />;
  },
  parameters: {
    initialState: {
      "application-colors": {
        brand: "#F9D45C",
      },
    },
  },
};
