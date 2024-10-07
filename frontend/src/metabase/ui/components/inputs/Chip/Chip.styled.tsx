import { type MantineThemeOverride, rem } from "@mantine/core";

export const getChipOverrides = (): MantineThemeOverride["components"] => ({
  Chip: {
    defaultProps: {
      size: 14,
    },
    variants: {
      brand: (_theme, _props, context) => {
        return {
          iconWrapper: {
            display: "none",
          },

          label: {
            backgroundColor: "var(--mb-color-brand-light)",
            color: "var(--mb-color-brand)",
            padding: "0.5rem 1rem ",
            display: "block",
            height: "auto",
            lineHeight: `calc(${rem(context.size)})`,

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
  },
});
