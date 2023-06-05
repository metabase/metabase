import React from "react";
import "metabase/css/index.css";
import { MantineProvider } from "@mantine/core";
import { theme } from "../frontend/src/metabase/ui/theme";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

// Pasta from - https://mantine.dev/guides/storybook/

function ThemeWrapper(props) {
  return (
    <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
      {props.children}
    </MantineProvider>
  );
}

// enhance your stories with decorator that uses ThemeWrapper
export const decorators = [
  renderStory => <ThemeWrapper>{renderStory()}</ThemeWrapper>,
];
