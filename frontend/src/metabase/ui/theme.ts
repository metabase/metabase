import type { MantineThemeOverride } from "@mantine/core";
import { ColorBaseOrion800 } from "../../../../styles/ts/styles";

const colors = {
  ocean: [
    "#E0F4FF",
    "#B9DAF8",
    "#8FC2EE",
    "#65AAE6",
    "#3C91DE",
    "#2478C5",
    "#195D9A",
    "",
    "",
    "",
  ],
  orion: [
    "#EDF1FF",
    "#D0D5E5",
    "#B1BACD",
    "#949EB8",
    "#7682A3",
    "#5C6989",
    "#47516B",
    "#323A4E",
    "#1C2331",
    "#040D17",
  ],
  fog: [
    "#FBFBFD",
    "#F2F2F7",
    "#E9E9EF",
    "#E0E0E7",
    "#D7D7DF",
    "#CECED7",
    "",
    "",
    "",
    "",
  ],
};
export const theme: MantineThemeOverride = {
  colors: colors,
  black: ColorBaseOrion800,
  fontFamily: "Lato, sans-serif",
  primaryColor: "ocean",
  primaryShade: 4,

  focusRingStyles: {
    styles(theme) {
      return {
        outline: `2px solid ${theme.colors.ocean[1]}`,
      };
    },
  },

  components: {
    Select: {
      styles(theme) {
        return {
          label: {
            color: theme.colors.orion[6],
            fontWeight: "bold",
            marginBottom: "0.2rem",
          },
          input: {
            ...theme.fn.focusStyles(),
          },
          itemWrapper: {
            padding: theme.spacing.m,
          },
          item: {
            "&[data-selected]": {
              "&,&:hover": {
                backgroundColor: theme.primaryColor,
              },
            },
            "&[data-hovered]": {
              backgroundColor: theme.colors.fog[1],
            },
          },
          ".mantine-Select-separatorLabel": {
            color: theme.colors.ocean[7],
          },
        };
      },
    },
  },
};
