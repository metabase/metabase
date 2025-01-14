import { defineMetabaseTheme } from "embedding-sdk/components/public";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

export const darkColors = {
  primary: "#DF75E9",
  filter: "#7ABBF9",
  lighterGrey: "#E3E7E4",
  lightGrey: "#ADABA9",
  darkGrey: "#3B3F3F",
  background: "#151C20",
};

export const darkTheme = defineMetabaseTheme({
  fontFamily: "Lato",
  fontSize: "14px",
  colors: {
    brand: darkColors.primary,
    "brand-hover": darkColors.darkGrey,
    "brand-hover-light": darkColors.darkGrey,
    filter: darkColors.filter,
    "text-primary": darkColors.lighterGrey,
    "text-secondary": darkColors.lighterGrey,
    "text-tertiary": darkColors.lighterGrey,
    border: darkColors.darkGrey,
    background: darkColors.background,
    "background-secondary": darkColors.darkGrey,
    "background-hover": darkColors.background,
    "background-disabled": darkColors.darkGrey,
    charts: [
      darkColors.primary,
      darkColors.filter,
      "#ED6A5A",
      "#FED18C",
      "#82A74B",
      "#FF8D69",
      "#ED6A5A",
      "#FED18C",
    ],
    positive: "#45DF4C",
    negative: "#FF3389",
  },
  components: {
    cartesian: {
      padding: "6px 16px",
    },
    dashboard: {
      card: {
        border: `1px solid ${darkColors.darkGrey}`,
        backgroundColor: "#212426",
      },
    },
    number: {
      value: {
        fontSize: "18px",
        lineHeight: "22px",
      },
    },
  },
});

const pugColors = {
  primary: "#3F4BF3",
  secondary: "#3F4BF3",
  lighterGrey: "#D1CFC5",
  lightGrey: "#545455",
  darkGrey: "#1B1C21",
  background: "#FFFCEE",
  positive: "#00B509",
  negative: "#D30100",
};

const pugTheme: MetabaseTheme = {
  // fontFamily: "DM Mono", // we don't have it in storybook
  fontSize: "14px",
  colors: {
    brand: pugColors.primary,
    filter: pugColors.secondary,
    "text-primary": pugColors.darkGrey,
    "text-secondary": pugColors.lightGrey,
    "text-tertiary": pugColors.lightGrey,
    border: "#3B3F3F",
    background: pugColors.background,
    "background-hover": "#FCFAF1",
    "background-disabled": pugColors.lighterGrey,
    charts: [
      pugColors.primary,
      pugColors.negative,
      "#ECB405",
      "#BD37C9",
      pugColors.positive,
      "#545455",
      pugColors.primary,
      pugColors.negative,
    ],
    positive: pugColors.positive,
    negative: pugColors.negative,
  },
  components: {
    cartesian: {
      padding: "6px 16px",
    },
    dashboard: {
      card: {
        border: "1px solid var(--mantine-color-gray-3)",
      },
    },
    number: {
      value: {
        fontSize: "24px",
        lineHeight: "30px",
      },
    },
  },
};

const stitchColors = {
  primary: "#DF75E9",
  filter: "#7ABBF9",
  lighterGrey: "#E3E7E4",
  lightGrey: "#ADABA9",
  darkGrey: "#3B3F3F",
  background: "#151C20",
};

const stitchTheme: MetabaseTheme = {
  fontFamily: "Inter",
  fontSize: "14px",
  colors: {
    brand: stitchColors.primary,
    "brand-hover": stitchColors.darkGrey,
    "brand-hover-light": stitchColors.darkGrey,
    filter: stitchColors.filter,
    "text-primary": stitchColors.lighterGrey,
    "text-secondary": stitchColors.lighterGrey,
    "text-tertiary": stitchColors.lighterGrey,
    border: stitchColors.darkGrey,
    background: stitchColors.background,
    "background-secondary": stitchColors.darkGrey,
    "background-hover": stitchColors.background,
    "background-disabled": stitchColors.darkGrey,
    charts: [
      stitchColors.primary,
      stitchColors.filter,
      "#ED6A5A",
      "#FED18C",
      "#82A74B",
      "#FF8D69",
      "#ED6A5A",
      "#FED18C",
    ],
    positive: "#45DF4C",
    negative: "#FF3389",
  },
  components: {
    cartesian: {
      padding: "6px 16px",
    },
    dashboard: {
      card: {
        border: `"1px solid ${stitchColors.darkGrey}"`,
        backgroundColor: "#212426",
      },
    },
    number: {
      value: {
        fontSize: "18px",
        lineHeight: "22px",
      },
    },
  },
};

const luminaraColors = {
  primary: "#E09862",
  background: "#F6F5F1",
  green1: "#80877F",
  green2: "#4F5951",
  green3: "#323E35",
  viz1: "#64786A",
};

const luminaraTheme: MetabaseTheme = {
  // fontFamily: "Arsenal", // we don't have it in storybook
  fontSize: "14px",
  colors: {
    brand: luminaraColors.primary,
    "brand-hover": "#fff",
    "brand-hover-light": "#fff",
    filter: luminaraColors.viz1,
    summarize: "#BE54C0",
    "text-primary": luminaraColors.green3,
    "text-secondary": luminaraColors.green3,
    "text-tertiary": luminaraColors.green3,
    border: luminaraColors.green1,
    background: luminaraColors.background,
    "background-secondary": luminaraColors.background,
    "background-hover": luminaraColors.background,
    "background-disabled": luminaraColors.green2,
    charts: [
      luminaraColors.viz1,
      "#E09862",
      "#BE54C0",
      "#DDA51F",
      "#B34332",
      "#4998E3",
      "#BE54C0",
      "#DDA51F",
    ],
    positive: luminaraColors.green3,
    negative: "#B34332",
    shadow: "rgba(0, 0, 0, 0.1)",
  },
  components: {
    cartesian: {
      padding: "6px 16px",
    },
    dashboard: {
      backgroundColor: "transparent",
    },
    number: {
      value: {
        fontSize: "36px",
        lineHeight: "36px",
      },
    },
  },
};

export const storybookThemes: Record<string, MetabaseTheme | undefined> = {
  default: undefined,
  dark: darkTheme,
  pug: pugTheme,
  stitch: stitchTheme,
  luminara: luminaraTheme,
};

export const storybookThemeOptions = Object.keys(storybookThemes);
