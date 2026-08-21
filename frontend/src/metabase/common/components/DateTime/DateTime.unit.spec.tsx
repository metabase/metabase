import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { DateTime } from "metabase/common/components/DateTime";
import { dayjs } from "metabase/dayjs";
import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/utils/formatting";
import type { DateFormattingSettings } from "metabase-types/api";

describe("DateTime", () => {
  const TEST_DATE = "2021-06-08T14:40:10Z";

  function setup(temporalFormatting: DateFormattingSettings = {}) {
    const settings = mockSettings({
      "custom-formatting": { "type/Temporal": temporalFormatting },
    });

    renderWithProviders(
      <DateTime value={TEST_DATE} data-testid="date-time" />,
      { storeInitialState: { settings } },
    );

    return screen.getByTestId("date-time");
  }

  function getExpectedFormat({
    date_style = DEFAULT_DATE_STYLE,
    time_style = DEFAULT_TIME_STYLE,
  }: DateFormattingSettings = {}) {
    return dayjs(TEST_DATE).format(`${date_style}, ${time_style}`);
  }

  it("uses default formatting", () => {
    const node = setup();
    expect(node).toHaveTextContent(getExpectedFormat());
  });

  it("respects custom date formatting style", () => {
    const style = { date_style: "dddd, MMMM D, YYYY" };
    const node = setup(style);
    expect(node).toHaveTextContent(getExpectedFormat(style));
  });

  it("respects custom time formatting style", () => {
    const style = { time_style: "HH:mm" };
    const node = setup(style);
    expect(node).toHaveTextContent(getExpectedFormat(style));
  });

  it("respects both date and time formatting style", () => {
    const style = { date_style: "dddd, MMMM D, YYYY", time_style: "h:mm A" };
    const node = setup(style);
    expect(node).toHaveTextContent(getExpectedFormat(style));
  });
});
