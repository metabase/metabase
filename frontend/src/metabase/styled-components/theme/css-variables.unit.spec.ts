import type { MantineTheme } from "metabase/ui";

import { getThemeSpecificCssVariables } from "./css-variables";

describe("getThemeSpecificCssVariables", () => {
  it("returns the correct CSS variables", () => {
    const theme = {
      other: {
        dashboard: {
          backgroundColor: "red",
          card: {
            backgroundColor: "purple",
          },
        },
      },
    } as MantineTheme;

    const styles = getThemeSpecificCssVariables(theme).styles;

    expect(styles).toContain("--mb-color-bg-dashboard: red;");
    expect(styles).toContain("--mb-color-bg-dashboard-card: purple;");
  });
});
