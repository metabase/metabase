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

function ThemeWrapper(props) {
  return (
    <MantineProvider theme={theme} withNormalizeCSS>
      {props.children}
    </MantineProvider>
  );
}

export const decorators = [
  renderStory => <ThemeWrapper>{renderStory()}</ThemeWrapper>,
];
