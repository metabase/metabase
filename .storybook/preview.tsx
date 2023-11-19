import React from "react";
import "metabase/css/index.css";
import "metabase/lib/dayjs";
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
  renderStory => <ThemeProvider>{renderStory()}</ThemeProvider>,
];
