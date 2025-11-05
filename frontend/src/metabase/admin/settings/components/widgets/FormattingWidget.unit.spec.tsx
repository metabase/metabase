import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
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

  await screen.findByText("Dates and times");
};

describe("FormattingWidget", () => {
  it("should render a FormattingWidget", async () => {
    await setup();
    [
      "Dates and times",
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

    const symbolRadio = within(currencyStyleWidget).getByLabelText(/Symbol/);
    const codeRadio = within(currencyStyleWidget).getByLabelText(/Code/);
    const nameRadio = within(currencyStyleWidget).getByLabelText(/Name/);

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(symbolRadio).toHaveAttribute("value", "symbol");
    expect(symbolRadio).toBeChecked();

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(codeRadio).toHaveAttribute("value", "code");
    expect(codeRadio).not.toBeChecked();

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(nameRadio).toHaveAttribute("value", "name");
    expect(nameRadio).not.toBeChecked();

    expect(
      within(currencyStyleWidget).queryByLabelText(/Local symbol/),
    ).not.toBeInTheDocument();
  });

  it("should update multiple settings", async () => {
    await setup();
    const blur = async () => {
      const elementOutside = screen.getByText("Dates and times");
      await userEvent.click(elementOutside); // blur
    };

    const dateStyleInput = await screen.findByLabelText("Date style");
    await userEvent.click(dateStyleInput);
    await userEvent.click(await screen.findByText("31/1/2018"));
    await blur();

    const dateAbbreviateToggle = await screen.findByRole("switch");
    await userEvent.click(dateAbbreviateToggle);
    await blur();

    const timeStyle24HourRadio = await screen.findByLabelText(/24-hour/i);
    await userEvent.click(timeStyle24HourRadio);
    await blur();

    const seperatorStyleInput = await screen.findByLabelText("Separator style");
    await userEvent.click(seperatorStyleInput);
    await userEvent.click(await screen.findByText("100000.00"));
    await blur();

    const currencyInput = await screen.findByLabelText("Unit of currency");
    await userEvent.click(currencyInput);
    await userEvent.click(await screen.findByText("New Zealand Dollar"));
    await blur();

    const currencyStyleNameRadio = await screen.findByLabelText(/name/i);
    await userEvent.click(currencyStyleNameRadio);
    await blur();

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
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(6);
    });
  });

  it("should provide expected number separators (#61854)", async () => {
    await setup();

    const seperatorStyleInput = await screen.findByLabelText("Separator style");
    await userEvent.click(seperatorStyleInput);

    const [dropdown] = screen.getAllByRole("listbox");
    const children = within(dropdown).getAllByRole("option");
    expect(children.length).toBe(5);

    expect(within(dropdown).getByText("100,000.00")).toBeInTheDocument();
    expect(within(dropdown).getByText("100 000,00")).toBeInTheDocument();
    expect(within(dropdown).getByText("100.000,00")).toBeInTheDocument();
    expect(within(dropdown).getByText("100000.00")).toBeInTheDocument();
    expect(within(dropdown).getByText("100’000.00")).toBeInTheDocument();
  });
});
