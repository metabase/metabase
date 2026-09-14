import { Dialog, type MantineThemeOverride } from "@mantine/core";

export const dialogOverrides: MantineThemeOverride["components"] = {
  Dialog: Dialog.extend({
    defaultProps: {
      shadow: "sm_outline",
      p: "lg",
    },
  }),
};
