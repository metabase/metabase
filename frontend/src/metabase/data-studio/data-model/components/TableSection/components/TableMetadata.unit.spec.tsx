import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { DateFormattingSettings } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { TableMetadata } from "./TableMetadata";

describe("TableMetadata", () => {
  function setup(temporalFormatting: DateFormattingSettings) {
    const settings = mockSettings({
      "custom-formatting": { "type/Temporal": temporalFormatting },
    });

    const table = createMockTable({ updated_at: "2021-06-08T14:40:10" });

    renderWithProviders(<TableMetadata table={table} />, {
      storeInitialState: { settings },
    });
  }

  it("formats the last updated at date with a long weekday/24h style", () => {
    setup({
      date_style: "dddd, MMMM D, YYYY",
      time_style: "HH:mm",
    });

    expect(
      screen.getByText("Tuesday, June 8, 2021, 14:40"),
    ).toBeInTheDocument();
  });

  it("formats the last updated at date with a short date/12h style", () => {
    setup({
      date_style: "MMMM D, YYYY",
      time_style: "h:mm A",
    });

    expect(screen.getByText("June 8, 2021, 2:40 PM")).toBeInTheDocument();
  });
});
