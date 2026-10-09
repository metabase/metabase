import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { dayjs } from "metabase/dayjs";
import type { DateFormattingSettings } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { TableMetadata } from "./TableMetadata";

const UPDATED_AT = "2021-06-08T14:40:10Z";

describe("TableMetadata", () => {
  function setup(temporalFormatting: DateFormattingSettings) {
    const settings = mockSettings({
      "custom-formatting": { "type/Temporal": temporalFormatting },
    });

    const table = createMockTable({ updated_at: UPDATED_AT });

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
      screen.getByText(dayjs(UPDATED_AT).format("dddd, MMMM D, YYYY, HH:mm")),
    ).toBeInTheDocument();
  });

  it("formats the last updated at date with a short date/12h style", () => {
    setup({
      date_style: "MMMM D, YYYY",
      time_style: "h:mm A",
    });

    expect(
      screen.getByText(dayjs(UPDATED_AT).format("MMMM D, YYYY, h:mm A")),
    ).toBeInTheDocument();
  });
});
