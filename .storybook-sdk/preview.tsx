import { GlobalTypes } from "@storybook/types";

// @ts-expect-error: See metabase/lib/delay
// This will skip the skippable delays in stories
window.METABASE_REMOVE_DELAYS = true;

import { storybookThemeOptions } from "embedding-sdk/test/storybook-themes";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

export const decorators = []; // No decorators for Embedding SDK stories, as we want to simulate real use cases

export const globalTypes: GlobalTypes = {
  sdkTheme: {
    name: "SDK Theme",
    description: "Global theme for sdk components",
    defaultValue: "default",
    toolbar: {
      icon: "paintbrush",
      items: storybookThemeOptions,
      showName: true,
    },
  },
};
