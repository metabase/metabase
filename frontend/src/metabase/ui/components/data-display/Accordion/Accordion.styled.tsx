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
            color: theme.fn.themeColor("brand"),
            fontWeight: 700,
          },
          item: {
            border: `1px solid ${theme.fn.themeColor("border")}`,
            borderRadius: theme.spacing.sm,
            "&[data-active]": {
              border: `1px solid ${theme.fn.themeColor("border")}`,
            },
            "& + &": {
              marginTop: "0.75rem",
            },
          },
          content: {
            borderTop: `1px solid ${theme.fn.themeColor("border")}`,
            color: theme.fn.themeColor("text-dark"),
          },
          chevron: {
            color: theme.fn.themeColor("text-dark"),
            border: `1px solid ${theme.fn.themeColor("border")}`,
            borderRadius: "100%",
            marginLeft: "1rem",
            height: "1.75rem",
            width: "1.75rem",
          },
        };
      },
    },
  });
