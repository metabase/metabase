import { useEffect } from "react";
import { GlobalTypes } from "@storybook/types";
import { initialize, mswLoader } from "msw-storybook-addon";
import type { StoryFn, StoryContext } from "@storybook/react";

import { storybookThemeOptions } from "embedding-sdk/test/storybook-themes";

import { availableLocales } from "./constants";
import { initSdkBundle } from "../enterprise/frontend/src/embedding-sdk/lib/public";

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

// We simulate SDK bundle loading timeout
const INIT_SDK_BUNDLE_TIMEOUT = 1000;
const decorators = [
  (Story: StoryFn, context: StoryContext) => {
    useEffect(() => {
      const handle = setTimeout(initSdkBundle, INIT_SDK_BUNDLE_TIMEOUT);

      return () => clearTimeout(handle);
    }, [context.name]);

    return <Story />;
  },
];

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
