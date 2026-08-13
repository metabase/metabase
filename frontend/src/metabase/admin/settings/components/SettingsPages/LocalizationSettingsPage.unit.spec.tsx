import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { LocalizationSettingsPage } from "./LocalizationSettingsPage";

const setup = async () => {
  const localizationSettings = {
    "site-locale": "En",
    "report-timezone": "",
    "start-of-week": "monday",
    // Unjustified type cast. FIXME
    "available-timezones": [
      "Europe/Paris",
      "Pacific/Auckland",
      "US/Mountain",
      "UTC",
    ] as string[],
  } as const;

  const settings = createMockSettings(localizationSettings);
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      // Unjustified type cast. FIXME
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  renderWithProviders(
    <div>
      <LocalizationSettingsPage />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  await screen.findByText("Instance language");
};

describe("LocalizationSettingsPage", () => {
  it("should render a LocalizationSettingsPage", async () => {
    await setup();
    [
      "Instance language",
      "Report timezone",
      "First day of the week",
      "Instance settings",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should update multiple settings", async () => {
    await setup();
    const blur = async () => {
      const elementOutside = screen.getByText("Dates and times");
      await userEvent.click(elementOutside); // blur
    };
    const timezoneInput = screen.getByLabelText("Report timezone");
    await userEvent.clear(timezoneInput);
    await userEvent.type(timezoneInput, "Mount");
    await userEvent.click(await screen.findByText("US/Mountain"));
    blur();

    const startOfWeekInput = screen.getByLabelText("First day of the week");
    await userEvent.click(startOfWeekInput);
    await userEvent.click(await screen.findByText("Tuesday"));
    blur();

    const currencyInput = screen.getByLabelText("Unit of currency");
    await userEvent.click(currencyInput);
    await userEvent.click(await screen.findByText("New Zealand Dollar"));
    blur();

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(3);
    });

    const puts = await findRequests("PUT");
    const { url: timezonePutUrl, body: timezonePutBody } = puts[0];
    const { url: startOfWeekPutUrl, body: startOfWeekPutBody } = puts[1];
    const { url: currencyPutUrl, body: currencyPutBody } = puts[2];

    expect(timezonePutUrl).toContain("/api/setting/report-timezone");
    expect(timezonePutBody).toEqual({ value: "US/Mountain" });

    expect(startOfWeekPutUrl).toContain("/api/setting/start-of-week");
    expect(startOfWeekPutBody).toEqual({ value: "tuesday" });

    expect(currencyPutUrl).toContain("/api/setting/custom-formatting");
    // custom-formatting is a nested JSON object. This just checks the currency value
    // to avoid being coupled to the entire object structure
    expect(currencyPutBody.value["type/Currency"].currency).toEqual("NZD");

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(3);
    });
  });
});
