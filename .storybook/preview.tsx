import React from "react";
import { ThemeProvider } from "metabase/ui";

import "metabase/css/core/index.css";
import "metabase/css/vendor.css";
import "metabase/css/index.module.css";
import "metabase/lib/dayjs";

import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { css, Global, useTheme } from "@emotion/react";
import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

const globalStyles = css`
  ${defaultFontFiles({ baseUrl: "/" })}

  body {
    font-size: 0.875em;
    ${rootStyle}
  }

  ${saveDomImageStyles}
  ${baseStyle}
`;

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

const preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
  decorators: [
    renderStory => (
      <EmotionCacheProvider>
        <ThemeProvider>
          <Global styles={globalStyles} />
          <CssVariables />
          {renderStory()}
        </ThemeProvider>
      </EmotionCacheProvider>
    ),
  ]
}

export default preview;
