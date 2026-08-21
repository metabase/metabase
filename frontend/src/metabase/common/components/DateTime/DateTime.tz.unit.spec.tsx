import { renderWithProviders, screen } from "__support__/ui";
import {
  DateTime,
  getFormattedTime,
} from "metabase/common/components/DateTime";
import { dayjs } from "metabase/dayjs";

const DEFAULT_FORMAT = "MMMM D, YYYY, h:mm A";
const DAY_FORMAT = "MMMM D, YYYY";

function renderDateTime(props: React.ComponentProps<typeof DateTime>) {
  renderWithProviders(<DateTime {...props} data-testid="date-time" />);
  return screen.getByTestId("date-time").textContent;
}

// entity timestamps arrive with the server's offset but should render in the browser's timezone
describe(`DateTime (client timezone ${process.env.TZ ?? "[default]"})`, () => {
  it.each([
    "2025-05-28T17:59:00Z",
    "2026-08-18T12:34:12.158773-07:00",
    "2026-01-01T00:30:00+05:45",
  ])("renders %s in the browser's timezone", (value) => {
    expect(renderDateTime({ value })).toBe(dayjs(value).format(DEFAULT_FORMAT));
  });

  it("uses the browser's calendar day for day-level display", () => {
    const value = "2026-08-18T23:30:00Z";

    expect(renderDateTime({ value, unit: "day" })).toBe(
      dayjs(value).format(DAY_FORMAT),
    );
  });

  it("keeps the value's own offset when local is false", () => {
    const value = "2026-08-18T12:34:12-07:00";

    expect(renderDateTime({ value, local: false })).toBe(
      "August 18, 2026, 12:34 PM",
    );
  });

  it("renders offset-less strings as written, since their timezone is unknown", () => {
    expect(renderDateTime({ value: "2021-06-08T14:40:10" })).toBe(
      "June 8, 2021, 2:40 PM",
    );
  });

  it("renders date-only strings as written", () => {
    expect(renderDateTime({ value: "2021-12-01", unit: "day" })).toBe(
      "December 1, 2021",
    );
  });

  it("getFormattedTime converts to the browser's timezone by default", () => {
    const value = "2025-05-28T17:59:00Z";

    expect(getFormattedTime(value)).toBe(dayjs(value).format(DEFAULT_FORMAT));
    expect(getFormattedTime(value, "default", { local: false })).toBe(
      "May 28, 2025, 5:59 PM",
    );
  });
});
