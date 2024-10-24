import React, { useEffect } from "react";
import { ThemeProvider } from "metabase/ui";

const isEmbeddingSDK = process.env.IS_EMBEDDING_SDK === "true";

if (!isEmbeddingSDK) {
  require("metabase/css/core/index.css");
  require("metabase/css/vendor.css");
  require("metabase/css/index.module.css");
  require("metabase/lib/dayjs");
}
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css"

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

export const decorators = isEmbeddingSDK
  ? [] // No decorators for Embedding SDK stories, as we want to simulate real use cases
  : [
      renderStory => (
        <EmotionCacheProvider>
          <ThemeProvider>
            <Global styles={globalStyles} />
            <CssVariables />
            {renderStory()}
          </ThemeProvider>
        </EmotionCacheProvider>
      ),
    ];

function CssVariables() {
  const theme = useTheme();
  useEffect(() => {
    // mantine v7 will not work correctly without this
    document.body.dir = "ltr";
  }, []);
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
