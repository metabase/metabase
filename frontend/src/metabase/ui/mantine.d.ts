import "./mantine-shared";

declare module "@mantine/core" {
  export interface MantineThemeOther {
    colorScheme: "light" | "dark";
  }

  export interface MantineTheme {
    fn: {
      themeColor: (colorName: string) => string;
    };
  }
}
