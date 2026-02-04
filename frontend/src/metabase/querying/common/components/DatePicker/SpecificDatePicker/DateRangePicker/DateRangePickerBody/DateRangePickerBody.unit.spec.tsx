import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { setLocalization } from "metabase/lib/i18n";

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

  describe("locale-dependent formatting", () => {
    afterAll(() => jest.resetModules());

    it.each([
      {
        locale: "en",
        expectedStart: "January 2, 2025",
        expectedEnd: "February 3, 2025",
      },
      {
        locale: "de",
        expectedStart: "2. Januar 2025",
        expectedEnd: "3. Februar 2025",
      },
    ])(
      "should display localized start/end date inputs for $locale",
      ({ locale, expectedStart, expectedEnd }) => {
        setLocalization({
          headers: {
            language: locale,
            "plural-forms": "nplurals=2; plural=(n != 1);",
          },
          translations: { "": {} },
        });

        setup({
          value: [new Date(2025, 0, 2), new Date(2025, 1, 3)],
        });

        expect(screen.getByLabelText("Start date")).toHaveValue(expectedStart);
        expect(screen.getByLabelText("End date")).toHaveValue(expectedEnd);
      },
    );
  });
});
