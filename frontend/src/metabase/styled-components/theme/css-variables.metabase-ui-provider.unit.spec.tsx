// eslint-disable-next-line eslint-js/no-restricted-imports -- not re-exported by metabase/ui
import { DEFAULT_THEME, mergeMantineTheme } from "@mantine/core";
import { render } from "@testing-library/react";

import { MetabaseUIProvider } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";

import { createColorVars, getThemeSpecificCssVariables } from "./css-variables";

describe("MetabaseUIProvider parity with the app", () => {
  /* eslint-disable testing-library/no-node-access -- Mantine styles are not queryable by role */
  const getStyleText = () =>
    Array.from(document.querySelectorAll("style[data-mantine-styles]"))
      .map((style) => style.textContent)
      .join("\n");
  /* eslint-enable testing-library/no-node-access */

  // Accepts both Emotion `css` results and plain strings.
  const toCssText = (value: string | { styles: string }) =>
    typeof value === "string" ? value : value.styles;

  const parseVars = (css: string | { styles: string }, prefix: string) =>
    Object.fromEntries(
      [...toCssText(css).matchAll(/(--[\w-]+):\s*([^;]+);/g)]
        .filter(([, name]) => name.startsWith(prefix))
        .map(([, name, value]) => [name, value.trim()]),
    );

  it.each(["light", "dark"] as const)(
    "writes the same --mb-color-* variables as the app (%s)",
    (colorScheme) => {
      render(
        <MetabaseUIProvider colorScheme={colorScheme}>x</MetabaseUIProvider>,
      );

      const expected = parseVars(
        createColorVars({ colorScheme }),
        "--mb-color-",
      );
      const actual = parseVars(getStyleText(), "--mb-color-");

      expect(Object.keys(expected).length).toBeGreaterThan(50);
      expect(actual).toEqual(expected);
    },
  );

  it.each(["light", "dark"] as const)(
    "writes the same default --mb-overlay-z-index as the app (%s)",
    (colorScheme) => {
      const theme = mergeMantineTheme(
        DEFAULT_THEME,
        getThemeOverrides({ colorScheme }),
      );
      const expected = parseVars(
        getThemeSpecificCssVariables(theme),
        "--mb-overlay-",
      );

      render(
        <MetabaseUIProvider colorScheme={colorScheme}>x</MetabaseUIProvider>,
      );

      expect(expected).toEqual({ "--mb-overlay-z-index": "200" });
      expect(parseVars(getStyleText(), "--mb-overlay-")).toEqual(expected);
    },
  );
});
