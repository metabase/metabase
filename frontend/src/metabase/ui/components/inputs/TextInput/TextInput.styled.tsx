import type { MantineThemeOverride } from "@mantine/core";

export const getTextInputOverrides =
  (): MantineThemeOverride["components"] => ({
    TextInput: {
      defaultProps: {
        size: "md",
        inputWrapperOrder: ["label", "description", "error", "input"],
      },
    },
  });
