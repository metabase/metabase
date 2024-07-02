import React from "react";
import "metabase/css/vendor.css";
import "metabase/css/index.module.css";
import "metabase/lib/dayjs";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";
import { css, Global } from "@emotion/react";
import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";

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

  ${baseStyle}
`;

export const decorators = [
  renderStory => (
    <EmotionCacheProvider>
      <ThemeProvider>
        <Global styles={globalStyles} />
        {renderStory()}
      </ThemeProvider>
    </EmotionCacheProvider>
  ),
];
