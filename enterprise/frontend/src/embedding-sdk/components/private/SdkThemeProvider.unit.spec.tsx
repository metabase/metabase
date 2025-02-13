import { renderWithProviders, screen } from "__support__/ui";
import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { Text } from "metabase/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

describe("SdkThemeProvider", () => {
  it("should inject colors from appearance settings and sdk themes", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "application-colors": {
          brand: "rgb(11, 11, 11)",
          filter: "rgb(33, 33, 33)",
        },
      }),
    });

    const theme = {
      colors: {
        "text-primary": "rgb(22, 22, 22)",
        filter: "rgb(44, 44, 44)",
      },
    };

    renderWithProviders(
      <SdkThemeProvider theme={theme}>
        <div>
          <Text c="brand">Brand</Text>
          <Text c="text-dark">Text Dark</Text>
          <Text c="filter">Filter</Text>
        </div>
      </SdkThemeProvider>,
      { storeInitialState: state },
    );

    const brand = window.getComputedStyle(screen.getByText("Brand"));
    const primary = window.getComputedStyle(screen.getByText("Text Dark"));
    const filter = window.getComputedStyle(screen.getByText("Filter"));

    // User interface colors should be applied
    expect(brand.color).toBe("rgb(11, 11, 11)");

    // SDK colors should be applied if they are not in the user interface colors
    expect(primary.color).toBe("rgb(22, 22, 22)");

    // SDK colors should override user interface colors
    expect(filter.color).toBe("rgb(44, 44, 44)");
  });
});
