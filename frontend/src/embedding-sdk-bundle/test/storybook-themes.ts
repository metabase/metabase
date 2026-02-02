import {
  type MetabaseEmbeddingTheme,
  defineMetabaseTheme,
} from "metabase/embedding-sdk/theme";
import { METABASE_DARK_THEME } from "metabase/lib/colors/constants/themes/dark";

export const darkColors = {
  primary: "#DF75E9",
  filter: "#7ABBF9",
  lighterGrey: "#E3E7E4",
  lightGrey: "#ADABA9",
  darkGrey: "#3B3F3F",
  background: "#161A1D",
};

export const darkTheme = defineMetabaseTheme({
  fontFamily: "Lato",
  fontSize: "14px",
  colors: {
    brand: darkColors.primary,
    filter: darkColors.filter,
    "text-primary": darkColors.lighterGrey,
    "text-secondary": darkColors.lighterGrey,
    "text-tertiary": darkColors.lightGrey,
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
  primary: "rgba(63, 75, 243)",
  secondary: "rgba(63, 75, 243)",
  lighterGrey: "#D1CFC5",
  lightGrey: "#545455",
  darkGrey: "#1B1C21",
  background: "#FFFCEE",
  positive: "#00B509",
  negative: "#D30100",
};

const pugTheme: MetabaseEmbeddingTheme = {
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
        border: "1px solid #dee2e6",
      },
    },
    number: {
      value: {
        fontSize: "24px",
        lineHeight: "30px",
      },
    },
    question: {
      toolbar: {
        backgroundColor: "#D8D9EE",
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
  background: "#161A1D",
};

const stitchTheme: MetabaseEmbeddingTheme = {
  fontFamily: "Inter",
  fontSize: "14px",
  colors: {
    brand: stitchColors.primary,
    filter: stitchColors.filter,
    "text-primary": stitchColors.lighterGrey,
    "text-secondary": stitchColors.lighterGrey,
    "text-tertiary": stitchColors.lightGrey,
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

const luminaraTheme: MetabaseEmbeddingTheme = {
  // fontFamily: "Arsenal", // we don't have it in storybook
  fontSize: "14px",
  colors: {
    brand: luminaraColors.primary,
    filter: luminaraColors.viz1,
    summarize: "#BE54C0",
    "text-primary": luminaraColors.green3,
    "text-secondary": luminaraColors.green3,
    "text-tertiary": luminaraColors.green3,
    border: luminaraColors.green1,
    background: luminaraColors.background,
    "background-secondary": luminaraColors.background,
    "background-hover": luminaraColors.background,
    "background-disabled": "#d6d6d6",
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
    question: {
      toolbar: {
        backgroundColor: "rgba(244, 243, 239, 1)",
      },
    },

    number: {
      value: {
        fontSize: "36px",
        lineHeight: "36px",
      },
    },
  },
};

const proficiencyColors = {
  primary: "rgba(106, 87, 201, 1)",
  lighterGrey: "#D1CFC5",
  lightGrey: "#4C4C4C",
  darkGrey: "#1B1C21",
  background: "#FCFDFD",
  positive: "rgba(0, 143, 93, 1)",
  negative: "rgba(234, 56, 41, 1)",
};

const proficiencyTheme: MetabaseEmbeddingTheme = {
  // fontFamily: "Figtree", // we don't have it in storybook
  fontSize: "14px",
  colors: {
    brand: proficiencyColors.primary,
    filter: proficiencyColors.primary,
    "text-primary": proficiencyColors.lightGrey,
    "text-secondary": proficiencyColors.lightGrey,
    "text-tertiary": "#979898",
    border: "#DEDFDF",
    background: proficiencyColors.background,
    "background-hover": "#fCFDFD",
    "background-disabled": "rgba(0, 0, 0, 0.1)",
    charts: [
      proficiencyColors.primary,
      "rgba(37, 90, 157, 1)",
      "rgba(182, 89, 166, 1)",
      proficiencyColors.primary,
      "rgba(238, 92, 127, 1)",
      "rgba(240, 115, 76, 1)",
      "rgba(243, 161, 26, 1)",
      "rgba(182, 89, 166, 1)",
    ],
    positive: proficiencyColors.positive,
    negative: proficiencyColors.negative,
  },
  components: {
    tooltip: {
      /** Tooltip text color. */
      textColor: proficiencyColors.darkGrey,

      /** Secondary text color shown in the tooltip, e.g. for tooltip headers and percentage changes. */
      secondaryTextColor: proficiencyColors.darkGrey,

      /** Tooltip background color. */
      backgroundColor: proficiencyColors.background,

      /** Tooltip background color for focused rows. */
      focusedBackgroundColor: proficiencyColors.lighterGrey,
    },
    cartesian: {
      padding: "6px 16px",
    },
    dashboard: {
      backgroundColor: "transparent",
      card: {
        backgroundColor: "#FFFFFF",
        border: "1px solid rgba(0, 0, 0, 0.12)",
      },
    },
    number: {
      value: {
        fontSize: "24px",
        lineHeight: "30px",
      },
    },
    popover: {
      zIndex: 201,
    },
    question: {
      toolbar: {
        backgroundColor: "transparent",
      },
    },
  },
};

export const storybookThemes: Record<
  string,
  MetabaseEmbeddingTheme | undefined
> = {
  default: undefined,
  dark: darkTheme,
  "dark-v2": METABASE_DARK_THEME,
  pug: pugTheme,
  stitch: stitchTheme,
  luminara: luminaraTheme,
  proficiency: proficiencyTheme,
};

export const storybookThemeOptions = Object.keys(storybookThemes);
