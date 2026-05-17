import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui-with-store";
import {
  deriveChartShadeColor,
  deriveChartTintColor,
} from "metabase/ui/colors/accents";
import { getThemeOverrides } from "metabase/ui/theme";
import MetabaseSettings from "metabase/utils/settings";
import type { SettingKey } from "metabase-types/api";

import { ColorSettingsWidget } from "./ColorSettingsWidget";

const originalApplicationColors = MetabaseSettings.get(
  "application-colors" as SettingKey,
);

function setup(colors: Record<string, string>) {
  MetabaseSettings.set("application-colors" as SettingKey, colors);
  fetchMock.get("path:/api/session/properties", {
    "application-colors": colors,
  });
  fetchMock.get("path:/api/setting", {});
  renderWithProviders(<ColorSettingsWidget />, {
    theme: getThemeOverrides("light", colors),
  });
}

async function expectColorsToExist(colors: Record<string, string>) {
  await Promise.all(
    Object.values(colors).map(async (color) => {
      expect(
        await screen.findByRole("button", { name: color }),
      ).toBeInTheDocument();
    }),
  );
}

describe("ColorSettingsWidget", () => {
  afterEach(() => {
    MetabaseSettings.set(
      "application-colors" as SettingKey,
      originalApplicationColors,
    );
  });

  it("should respect whitelabel colors", async () => {
    const colors = {
      accent0: "#abcdef",
      "accent0-light": "#123456",
      "accent0-dark": "#789012",
    };
    setup(colors);
    await expectColorsToExist(colors);
  });

  it("should derive light and dark variants of whitelabel colors", async () => {
    const colors = {
      accent0: "#abcdef",
      "accent1-light": "#123456",
    };
    setup(colors);
    const expectedColors = {
      ...colors,
      "accent0-light": deriveChartTintColor(colors.accent0),
      "accent0-dark": deriveChartShadeColor(colors.accent0),
      accent1: deriveChartShadeColor(colors["accent1-light"]),
      "accent1-dark": deriveChartShadeColor(
        deriveChartShadeColor(colors["accent1-light"]),
      ),
    };
    await expectColorsToExist(expectedColors);
  });
});
