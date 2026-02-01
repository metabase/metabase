import userEvent from "@testing-library/user-event";
import { act } from "react-dom/test-utils";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { LocalizationSettingsPage } from "./LocalizationSettingsPage";

const setup = async () => {
  const localizationSettings = {
    "site-locale": "En",
    "report-timezone": "",
    "start-of-week": "monday",
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
};

describe("LocalizationSettingsPage", () => {
  it("should render a LocalizationSettingsPage", async () => {
    await act(() => setup());
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
    setup();
    const blur = async () => {
      const elementOutside = screen.getByText("Dates and times");
      await userEvent.click(elementOutside); // blur
    };
    const timezoneInput = await screen.findByLabelText("Report timezone");
    await userEvent.clear(timezoneInput);
    await userEvent.type(timezoneInput, "Mount");
    await userEvent.click(await screen.findByText("US/Mountain"));
    await blur();

    const startOfWeekInput = await screen.findByLabelText(
      "First day of the week",
    );
    await userEvent.click(startOfWeekInput);
    await userEvent.click(await screen.findByText("Tuesday"));
    await blur();

    const currencyInput = await screen.findByLabelText("Unit of currency");
    await userEvent.click(currencyInput);
    await userEvent.click(await screen.findByText("New Zealand Dollar"));
    await blur();

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
