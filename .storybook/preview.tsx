import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { PortalContainer, ThemeProvider } from "metabase/ui";

// @ts-expect-error: See metabase/utils/delay
// This will skip the skippable delays in stories
window.METABASE_REMOVE_DELAYS = true;

require("metabase/css/core/index.css");
require("metabase/css/index.module.css");
require("metabase/utils/dayjs");

// EChartsRenderer is loaded as an on-demand chunk in the app (see
// EChartsRenderer/lazy.ts). Force it into the Storybook bundle so chart stories
// render echarts synchronously and visual snapshots are deterministic (no
// lazy-chunk skeleton flash). The dynamic `import()` then resolves from the
// already-loaded module.
require("metabase/visualizations/components/EChartsRenderer/EChartsRenderer");

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import { OverlayStackProvider } from "metabase/ui/components/overlays/overlay-stack";
import { EmotionCacheProvider } from "metabase/ui/components/theme/EmotionCacheProvider";

import { Global, css, useTheme } from "@emotion/react";

import { saveDomImageStyles } from "metabase/visualizations/lib/image-exports";

import { initialize, mswLoader } from "msw-storybook-addon";

// Inject @font-face declarations synchronously at preview load so that bundled
// fonts are registered with `document.fonts` before any story's loaders run.
// Without this, the Emotion <Global /> in the decorator below registers them
// later, and the fontsReady loader has nothing to wait for on first render.
if (
  typeof document !== "undefined" &&
  !document.head.querySelector("style[data-metabase-font-faces]")
) {
  const fontFaceStyle = document.createElement("style");
  fontFaceStyle.dataset.metabaseFontFaces = "true";
  fontFaceStyle.textContent = defaultFontFiles({ baseUrl: "/" }).styles;
  document.head.appendChild(fontFaceStyle);
}

// Force every registered font to load before the story renders. This ensures we
// use same fonts for tests every time, instead of using generic fallback
// family like `sans-serif` which might resolve to different specific fonts (depending
// on what available on current machine) which might have different metrics, in turn
// producing inconsistent behavior in code relying on measuring text (e.g., column
// autosize in table visualization). Awaiting all loads here makes measurements
// deterministic across platforms.
const fontsReady = async () => {
  const loads: Promise<unknown>[] = [];
  document.fonts.forEach((face) => loads.push(face.load()));
  await Promise.all(loads);
};

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

const getResolvedColorScheme = (
  displayTheme: string | undefined,
): "light" | "dark" => {
  switch (displayTheme) {
    case "night":
    case "dark":
      return "dark";
    default:
      return "light";
  }
};

const decorators = [
  (Story, { args = {}, globals }) => {
    if (!document.body.classList.contains("mb-wrapper")) {
      document.body.classList.add("mb-wrapper");
    }

    const resolvedColorScheme = getResolvedColorScheme(
      args.theme ?? globals.theme,
    );

    return (
      <EmotionCacheProvider>
        <OverlayStackProvider>
          <ThemeProvider resolvedColorScheme={resolvedColorScheme}>
            <Global styles={globalStyles} />
            <CssVariables />
            {createPortal(<PortalContainer />, document.body)}
            <Story />
          </ThemeProvider>
        </OverlayStackProvider>
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
  loaders: [mswLoader, fontsReady],
  argTypes,
};

export default preview;
