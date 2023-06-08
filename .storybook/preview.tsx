import React from "react";
import "metabase/css/index.css";
import { ThemeProvider } from "../frontend/src/metabase/ui";

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
