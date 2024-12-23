import { defineMetabaseTheme } from "embedding-sdk";

export function getSdkStorybookDarkTheme() {
  const darkColors = {
    primary: "#DF75E9",
    filter: "#7ABBF9",
    lighterGrey: "#E3E7E4",
    lightGrey: "#ADABA9",
    darkGrey: "#3B3F3F",
    background: "#151C20",
  };

  return defineMetabaseTheme({
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
          border: `"1px solid ${darkColors.darkGrey}"`,
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
}
