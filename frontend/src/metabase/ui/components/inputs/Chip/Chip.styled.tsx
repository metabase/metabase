import { type MantineThemeOverride, rem } from "@mantine/core";

export const getChipOverrides = (): MantineThemeOverride["components"] => ({
  Chip: {
    defaultProps: {
      size: 14,
    },

    styles: (_theme, _props, context) => {
      return {
        iconWrapper: {
          display: "none",
        },
        root: {
          width: "fit-content",
        },
        label: {
          backgroundColor: "var(--mb-color-brand-lighter)",
          color: "var(--mb-color-brand)",
          padding: "0.5rem 1rem ",
          display: "block",
          height: "auto",
          lineHeight: `calc(${rem(context.size)})`,
          fontWeight: 700,

          "&:hover": {
            backgroundColor: "var(--mb-color-brand-light)",
          },

          "&[data-checked=true]": {
            backgroundColor: "var(--mb-color-brand)",
            color: "white",
            paddingInline: "1rem",
          },
        },
        input: {
          display: "block",
        },
      };
    },
  },
});
