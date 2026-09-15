import _userEvent from "@testing-library/user-event";

import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { DATE_PICKER_UNITS } from "metabase/querying/common/constants";
import type {
  DatePickerUnit,
  RelativeDatePickerValue,
} from "metabase/querying/common/types";

import { CurrentDatePicker } from "./CurrentDatePicker";

const DEFAULT_VALUE: RelativeDatePickerValue = {
  type: "relative",
  value: 0,
  unit: "hour",
};

interface SetupOpts {
  value?: RelativeDatePickerValue;
  availableUnits?: DatePickerUnit[];
  settingsLoaded?: boolean;
}

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

function setup({
  value = DEFAULT_VALUE,
  availableUnits = DATE_PICKER_UNITS,
  settingsLoaded = true,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const settings = createMockSettingsState({ "start-of-week": "sunday" });

  if (!settingsLoaded) {
    settings.loading = true;
    Reflect.deleteProperty(settings.values, "start-of-week");
  }

  renderWithProviders(
    <CurrentDatePicker
      value={value}
      availableUnits={availableUnits}
      onChange={onChange}
    />,
    {
      storeInitialState: {
        settings,
      },
    },
  );

  return { onChange };
}

describe("CurrentDatePicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  it("should be able to filter by a current interval", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Week"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 0,
      unit: "week",
    });
  });

  it("should show the date range for the selected interval", async () => {
    setup();

    await userEvent.hover(screen.getByText("Week"));

    expect(
      await screen.findByText("Right now, this is Dec 29, 2019 – Jan 4, 2020"),
    ).toBeInTheDocument();
  });

  it("should use Sunday while settings are loading", async () => {
    setup({ settingsLoaded: false });

    await userEvent.hover(screen.getByText("Week"));

    expect(
      await screen.findByText("Right now, this is Dec 29, 2019 – Jan 4, 2020"),
    ).toBeInTheDocument();
  });
});
