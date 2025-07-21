import { GlobalTypes } from "@storybook/types";
import { initialize, mswLoader } from "msw-storybook-addon";

import { storybookThemeOptions } from "embedding-sdk/test/storybook-themes";

import { availableLocales } from "./constants";
import { defineGlobalDependencies } from "../enterprise/frontend/src/embedding-sdk/sdk-wrapper/lib/private/define-global-dependencies";

// To run initialization side effects like Mantine styles, dayjs plugins, etc
// Also to properly watch and recompile when the SDK code is updated
// This does not break the SDK Bundle loading logic
import "embedding-sdk/bundle";
defineGlobalDependencies();

// @ts-expect-error: See metabase/lib/delay
// This will skip the skippable delays in stories
window.METABASE_REMOVE_DELAYS = true;

const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

const decorators = [];

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
