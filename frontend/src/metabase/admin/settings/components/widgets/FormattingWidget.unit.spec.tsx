import userEvent from "@testing-library/user-event";
import { act } from "react-dom/test-utils";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { FormattingWidget } from "./FormattingWidget";

const setup = async () => {
  const settings = createMockSettings();
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  renderWithProviders(
    <div>
      <FormattingWidget />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("PublicSharingSettingsPage", () => {
  it("should render a FormattingWidget", async () => {
    await act(() => setup());
    [
      "Dates and Times",
      "Date style",
      "Abbreviate days and months",
      "Time style",
      "Separator style",
      "Unit of currency",
      "Currency label style",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
    expect(
      await screen.findByDisplayValue("January 31, 2018"),
    ).toBeInTheDocument();
    expect(await screen.findByDisplayValue("100,000.00")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("US Dollar")).toBeInTheDocument();

    const timeStyleWidget = screen.getByTestId("time_style-formatting-setting");
    const timeStyleRadios = within(timeStyleWidget).getAllByRole("radio");
    expect(timeStyleRadios).toHaveLength(2);

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(timeStyleRadios[0]).toHaveAttribute("value", "h:mm A");
    expect(timeStyleRadios[0]).toBeChecked();

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(timeStyleRadios[1]).toHaveAttribute("value", "HH:mm");
    expect(timeStyleRadios[1]).not.toBeChecked();

    const currencyStyleWidget = screen.getByTestId(
      "currency_style-formatting-setting",
    );

    const dateAbbreviateToggle = await screen.findByRole("switch");
    expect(dateAbbreviateToggle).not.toBeChecked();

    const symbolRadio = within(currencyStyleWidget).getByLabelText(/symbol/i);
    const codeRadio = within(currencyStyleWidget).getByLabelText(/code/i);
    const nameRadio = within(currencyStyleWidget).getByLabelText(/name/i);

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(symbolRadio).toHaveAttribute("value", "symbol");
    expect(symbolRadio).toBeChecked();

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(codeRadio).toHaveAttribute("value", "code");
    expect(codeRadio).not.toBeChecked();

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(nameRadio).toHaveAttribute("value", "name");
    expect(nameRadio).not.toBeChecked();
  });

  it("should update multiple settings", async () => {
    setup();
    const blur = async () => {
      const elementOutside = screen.getByText("Dates and Times");
      await userEvent.click(elementOutside); // blur
    };

    const dateStyleInput = await screen.findByLabelText("Date style");
    dateStyleInput.click();
    await userEvent.click(await screen.findByText("31/1/2018"));
    blur();

    const dateAbbreviateToggle = await screen.findByRole("switch");
    dateAbbreviateToggle.click();
    blur();

    const timeStyle24HourRadio = await screen.findByLabelText(/24-hour/i);
    timeStyle24HourRadio.click();
    blur();

    const seperatorStyleInput = await screen.findByLabelText("Separator style");
    await userEvent.click(seperatorStyleInput);
    await userEvent.click(await screen.findByText("100000.00"));
    blur();

    const currencyInput = await screen.findByLabelText("Unit of currency");
    await userEvent.click(currencyInput);
    await userEvent.click(await screen.findByText("New Zealand Dollar"));
    blur();

    const currencyStyleNameRadio = await screen.findByLabelText(/name/i);
    await userEvent.click(currencyStyleNameRadio);
    blur();

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(6);
    });

    const puts = await findRequests("PUT");
    const [{ url, body }] = puts.slice(-1); // last put
    expect(url).toContain("/api/setting/custom-formatting");
    // the custom-formatting object gets updates merged into it
    // so the last put should contain the latest values from all the inputs
    expect(body).toEqual({
      value: {
        "type/Currency": {
          currency: "NZD",
          currency_style: "name",
        },
        "type/Number": {
          number_separators: ".",
        },
        "type/Temporal": {
          date_abbreviate: true,
          date_style: "D/M/YYYY",
          time_style: "HH:mm",
        },
      },
    });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check icon");
      expect(toasts).toHaveLength(6);
    });
  });
});
