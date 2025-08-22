import { GlobalTypes } from "@storybook/types";
import { initialize, mswLoader } from "msw-storybook-addon";

// @ts-expect-error: See metabase/lib/delay
// This will skip the skippable delays in stories
window.METABASE_REMOVE_DELAYS = true;

import { storybookThemeOptions } from "embedding-sdk-bundle/test/storybook-themes";
import { availableLocales } from "./constants";

const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

const decorators = []; // No decorators for Embedding SDK stories, as we want to simulate real use cases

const globalTypes: GlobalTypes = {
  sdkTheme: {
    name: "SDK Theme",
    description: "Global theme for sdk components",
    defaultValue: "default",
    toolbar: {
      icon: "paintbrush",
      items: storybookThemeOptions,
      showName: true,
      dynamicTitle: true,
    },
  },
  user: {
    name: "User",
    description: "User to use for sdk components",
    defaultValue: "admin",
    toolbar: {
      icon: "user",
      items: ["admin", "normal"],
      showName: true,
      dynamicTitle: true,
    },
  },
  locale: {
    name: "Locale",
    description: "Locale to be passed to the MetabaseProvider",
    defaultValue: undefined,
    toolbar: {
      icon: "globe",
      items: availableLocales,
      showName: true,
      dynamicTitle: true,
    },
  },
};

/*
 * Initializes MSW
 * See https://github.com/mswjs/msw-storybook-addon#configuring-msw
 * to learn how to customize it
 */

initialize({
  onUnhandledRequest: "bypass",
});
const preview = { parameters, decorators, globalTypes, loaders: [mswLoader] };

export default preview;
