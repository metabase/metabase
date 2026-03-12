import React, { useEffect, useMemo } from "react";

import { ThemeProvider } from "metabase/ui";

// @ts-expect-error: See metabase/lib/delay
// This will skip the skippable delays in stories
window.METABASE_REMOVE_DELAYS = true;

require("metabase/css/core/index.css");
require("metabase/css/vendor.css");
require("metabase/css/index.module.css");
require("metabase/lib/dayjs");

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";

import { Global, css, useTheme } from "@emotion/react";

import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/image-exports";

import { initialize, mswLoader } from "msw-storybook-addon";

// Note: Changing the names of the stories may impact loki visual testing. Please ensure that
// Any story name changes are also reflected in the loki.config.js storiesFilter array.
const parameters = {
  options: {
    storySort: {
      order: [
        "Intro",
        "Design System",
        "Typography",
        "Components",
        [
          "Buttons",
          "Data display",
          "Feedback",
          "Inputs",
          "Overlays",
          "Parameters",
          "Navigation",
          "Text",
          "*",
          "Utils",
          "Ask Before Using",
        ],
        "Patterns",
        "Viz",
        "*",
        "App",
        "Deprecated",
      ],
    },
  },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

const argTypes = {
  theme: {
    control: {
      type: "inline-radio",
    },
    options: ["light", "dark"],
  },
};

const globalStyles = css`
  ${defaultFontFiles({ baseUrl: "/" })}

  body {
    font-size: 0.875em;
    ${rootStyle}
  }

  ${saveDomImageStyles}
  ${baseStyle}
`;

const decorators = [
  (Story, { args = {}, globals }) => {
    if (!document.body.classList.contains("mb-wrapper")) {
      document.body.classList.add("mb-wrapper");
    }

    return (
      <EmotionCacheProvider>
        <ThemeProvider displayTheme={args.theme ?? globals.theme}>
          <Global styles={globalStyles} />
          <CssVariables />
          <Story />
        </ThemeProvider>
      </EmotionCacheProvider>
    );
  },
];

function CssVariables() {
  const theme = useTheme();
  useEffect(() => {
    // mantine v7 will not work correctly without this
    document.body.dir = "ltr";
  }, []);

  // This can get expensive so we should memoize it separately
  const cssVariables = useMemo(() => {
    return getMetabaseCssVariables({ theme });
  }, [theme]);

  const styles = useMemo(() => {
    return css`
      ${cssVariables}

      :root {
        --mb-default-font-family: "Lato";

        /*
      Theming-specific CSS variables.
      These CSS variables are not part of the core design system colors.
    **/
        --mb-color-bg-dashboard: var(--mb-color-background-primary);
        --mb-color-bg-dashboard-card: var(--mb-color-background-primary);
      }

      /* For Embed frame questions to render properly */
      #root:has([data-testid="embed-frame"]),
      [data-testid="embed-frame"] {
        height: 100%;
      }
    `;
  }, [theme]);

  return <Global styles={styles} />;
}

/*
 * Initializes MSW
 * See https://github.com/mswjs/msw-storybook-addon#configuring-msw
 * to learn how to customize it
 */

initialize({
  onUnhandledRequest: "bypass",
});
const preview = {
  parameters,
  decorators,
  loaders: [mswLoader],
  argTypes,
};

export default preview;
