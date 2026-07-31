import { render, screen } from "__support__/ui";

import ChartSettingsWidget from "./ChartSettingsWidget";

describe("ChartSettingsWidget", () => {
  it("keeps a minimum gap between the title and an inline widget (metabase#78685)", () => {
    render(
      <ChartSettingsWidget
        id="date_abbreviate"
        title="Abbreviate days and months"
        inline
        widget={() => <input type="checkbox" />}
      />,
    );

    const root = screen.getByTestId("chart-settings-widget-date_abbreviate");
    expect(root).toHaveStyle({ gap: "var(--mantine-spacing-sm)" });
  });
});
