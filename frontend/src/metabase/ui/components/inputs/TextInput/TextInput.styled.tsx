import type { MantineThemeOverride } from "@mantine/core";

export const getTextInputOverrides =
  (): MantineThemeOverride["components"] => ({
    TextInput: {
      defaultProps: {
        size: "md",
        inputWrapperOrder: ["label", "description", "input", "error"],
        errorProps: {
          role: "alert",
        },
      },
      styles: () => ({
        input: {
          color: "var(--mb-color-text-primary)",
          background: "var(--mb-color-background)",
          borderColor: "var(--mb-color-border)",
        },
        error: {
          "&::first-letter": { textTransform: "capitalize" },
        },
      }),
    },
  });
