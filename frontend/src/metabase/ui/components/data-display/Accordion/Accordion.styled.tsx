import type { MantineThemeOverride } from "@mantine/core";

export const getAccordionOverrides =
  (): MantineThemeOverride["components"] => ({
    Accordion: {
      styles: theme => {
        return {
          control: {
            paddingLeft: 14,
            "&:hover": {
              background: "unset",
            },
          },
          label: {
            color: theme.colors.brand[1],
            fontWeight: 700,
          },
          item: {
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.spacing.sm,
            "&[data-active]": {
              border: `1px solid ${theme.colors.border}`,
            },
            "& + &": {
              marginTop: "0.75rem",
            },
          },
          content: {
            borderTop: `1px solid ${theme.colors.border}`,
            color: theme.colors.text[2],
          },
          chevron: {
            color: theme.colors.text[2],
            border: `1px solid ${theme.colors.border}`,
            borderRadius: "100%",
            marginLeft: "1rem",
            height: "1.75rem",
            width: "1.75rem",
          },
        };
      },
    },
  });
