import React from "react";
import { ThemeProvider } from "metabase/ui";

// @ts-expect-error: See metabase/lib/delay
// This will skip the skippable delays in stories
window.METABASE_REMOVE_DELAYS = true;

require("metabase/css/core/index.css");
require("metabase/css/vendor.css");
require("metabase/css/index.module.css");
require("metabase/lib/dayjs");

import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { css, Global, useTheme } from "@emotion/react";
import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
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

export const decorators = [
  renderStory => {
    if (!document.body.classList.contains("mb-wrapper")) {
      document.body.classList.add("mb-wrapper");
    }
    return (
      <EmotionCacheProvider>
        <ThemeProvider>
          <Global styles={globalStyles} />
          <CssVariables />
          {renderStory()}
        </ThemeProvider>
      </EmotionCacheProvider>
    );
  },
];

function CssVariables() {
  const theme = useTheme();
  const styles = css`
    ${getMetabaseCssVariables(theme)}

    :root {
      --mb-default-font-family: "Lato";

      /*
      Theming-specific CSS variables.
      These CSS variables are not part of the core design system colors.
    **/
      --mb-color-bg-dashboard: var(--mb-color-bg-white);
      --mb-color-bg-dashboard-card: var(--mb-color-bg-white);
    }

    /* For Embed frame questions to render properly */
    #root:has([data-testid="embed-frame"]),
    [data-testid="embed-frame"] {
      height: 100%;
    }
  `;

  return <Global styles={styles} />;
}
