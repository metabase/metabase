import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import "dayjs/locale/de";

import { render, screen } from "__support__/ui";

import { DateRangePickerBody } from "./DateRangePickerBody";

type SetupOpts = {
  value: [Date, Date];
  hasTime?: boolean;
};

function setup({ value, hasTime = false }: SetupOpts) {
  const onChange = jest.fn();
  render(
    <DateRangePickerBody value={value} hasTime={hasTime} onChange={onChange} />,
  );
  return { onChange };
}

describe("DateRangePickerBody", () => {
  it("should highlight the start date of the in-progress date range selection (metabase#51994)", async () => {
    const { onChange } = setup({
      value: [new Date(2020, 0, 5), new Date(2020, 1, 20)],
    });
    expect(screen.getByLabelText("5 January 2020")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByLabelText("20 February 2020")).toHaveAttribute(
      "data-selected",
      "true",
    );

    await userEvent.click(screen.getByLabelText("10 January 2020"));
    expect(screen.getByLabelText("5 January 2020")).not.toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByLabelText("20 February 2020")).not.toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByLabelText("10 January 2020")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText("8 February 2020"));
    expect(onChange).toHaveBeenCalledWith([
      new Date(2020, 0, 10),
      new Date(2020, 1, 8),
    ]);
  });

  describe("text input synchronization with calendar navigation", () => {
    it("should navigate calendar with start date input (metabase#64602)", async () => {
      setup({
        value: [new Date(2020, 0, 5), new Date(2020, 1, 20)], // Jan 5 - Feb 20
      });

      expect(screen.getByText("January 2020")).toBeInTheDocument();

      const dateInput = screen.getByLabelText("Start date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "03/15/2020");

      expect(screen.getByText("March 2020")).toBeInTheDocument();
      expect(screen.queryByText("January 2020")).not.toBeInTheDocument();
    });

    it("should navigate calendar with end date input (metabase#64602)", async () => {
      setup({
        value: [new Date(2020, 0, 5), new Date(2020, 1, 20)], // Jan 5 - Feb 20
      });

      expect(screen.getByText("January 2020")).toBeInTheDocument();

      const dateInput = screen.getByLabelText("End date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "01/15/2019");

      expect(screen.getByText("January 2019")).toBeInTheDocument();
      expect(screen.queryByText("January 2020")).not.toBeInTheDocument();
    });
  });

  describe("date format localization (metabase#65480)", () => {
    it("should display dates in German format (DD.MM.YYYY) when locale is 'de'", () => {
      const originalLocale = dayjs.locale();
      dayjs.locale("de");

      setup({
        value: [new Date(2020, 0, 15), new Date(2020, 1, 20)],
      });

      // In German locale, dates should be displayed as DD.MM.YYYY
      const startDateInput = screen.getByLabelText("Start date");
      const endDateInput = screen.getByLabelText("End date");

      expect(startDateInput).toHaveValue("15.01.2020");
      expect(endDateInput).toHaveValue("20.02.2020");

      dayjs.locale(originalLocale);
    });

    it("should display dates in US format (MM/DD/YYYY) when locale is 'en'", () => {
      const originalLocale = dayjs.locale();
      dayjs.locale("en");

      setup({
        value: [new Date(2020, 0, 15), new Date(2020, 1, 20)], // Jan 15 - Feb 20
      });

      const startDateInput = screen.getByLabelText("Start date");
      const endDateInput = screen.getByLabelText("End date");

      expect(startDateInput).toHaveValue("01/15/2020");
      expect(endDateInput).toHaveValue("02/20/2020");

      dayjs.locale(originalLocale);
    });
  });
});
