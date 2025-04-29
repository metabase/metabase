import { GlobalTypes } from "@storybook/types";
import { initialize, mswLoader } from "msw-storybook-addon";

// @ts-expect-error: See metabase/lib/delay
// This will skip the skippable delays in stories
window.METABASE_REMOVE_DELAYS = true;

import { storybookThemeOptions } from "embedding-sdk/test/storybook-themes";
import { loader } from "mini-css-extract-plugin";

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
