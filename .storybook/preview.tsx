import React from "react";
import "metabase/css/vendor.css";
import "metabase/css/index.module.css";
import "metabase/lib/dayjs";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

export const decorators = [
  renderStory => (
    <EmotionCacheProvider>
      <ThemeProvider>{renderStory()}</ThemeProvider>
    </EmotionCacheProvider>
  ),
];
