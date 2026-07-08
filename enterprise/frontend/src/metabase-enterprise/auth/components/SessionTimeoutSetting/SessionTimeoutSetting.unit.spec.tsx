import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { SessionTimeoutSetting } from "metabase-enterprise/auth/components/SessionTimeoutSetting";
import type { TimeoutValue } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

const DEFAULT_VALUE = { amount: 30, unit: "minutes" };

const setup = async (
  value: TimeoutValue | null = DEFAULT_VALUE,
  setByEnvVar = false,
) => {
  setupPropertiesEndpoints(
    createMockSettings({
      "session-timeout": value,
      "token-features": createMockTokenFeatures({
        session_timeout_config: true,
      }),
    }),
  );
  setupSettingsEndpoints([
    {
      key: "session-timeout",
      value,
      is_env_setting: setByEnvVar,
      env_name: "MB_SESSION_TIMEOUT",
    },
  ]);
  setupUpdateSettingEndpoint();
  renderWithProviders(<SessionTimeoutSetting />);
  await screen.findByText("Session timeout");
};

describe("SessionTimeoutSetting", () => {
  const SUCCEED_TEST_CASES = [
    { value: { amount: 1, unit: "minutes" } },
    { value: { amount: 1, unit: "hours" } },
    { value: { amount: 60 * 24 * 365.25 * 100 - 1, unit: "minutes" } },
    { value: { amount: 24 * 365.25 * 100 - 1, unit: "hours" } },
  ];

  const FAIL_TEST_CASES = [
    {
      value: { amount: 0, unit: "minutes" },
      error: "Timeout must be greater than 0",
    },
    {
      value: { amount: 0, unit: "hours" },
      error: "Timeout must be greater than 0",
    },
    {
      value: { amount: 60 * 24 * 365.25 * 100, unit: "minutes" },
      error: "Timeout must be less than 100 years",
    },
    {
      value: { amount: 24 * 365.25 * 100, unit: "hours" },
      error: "Timeout must be less than 100 years",
    },
  ];

  SUCCEED_TEST_CASES.map(({ value }) => {
    it(`validates ${value.amount} ${value.unit} correctly`, async () => {
      await setup(DEFAULT_VALUE);
      const textbox = await screen.findByLabelText("Amount");
      const dropdown = await screen.findByLabelText("Unit");

      await userEvent.clear(textbox);
      await userEvent.type(textbox, String(value.amount));
      await userEvent.click(dropdown);
      await userEvent.click(screen.getByText(value.unit));

      const puts = await findRequests("PUT");
      const [{ url, body }] = puts.slice(-1); // last put
      expect(url).toMatch(/\/api\/setting\/session-timeout/);
      expect(body).toEqual({ value });
      expect(screen.queryByText(/Timeout must be/)).not.toBeInTheDocument();
    });
  });

  FAIL_TEST_CASES.map(({ value, error }) => {
    it(`shows error for ${value.amount} ${value.unit} correctly`, async () => {
      await setup({
        ...DEFAULT_VALUE,
        unit: value.unit,
      });
      const textbox = await screen.findByLabelText("Amount");

      await userEvent.clear(textbox);
      await userEvent.type(textbox, String(value.amount));
      fireEvent.blur(textbox);

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(0);

      expect(screen.getByText(error)).toBeInTheDocument();
    });
  });

  it("should render a null value as disabled", async () => {
    await setup(null);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("should render a populated value as enabled", async () => {
    await setup({ amount: 1, unit: "minutes" });
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("should show a notice if it's set by environment variable", async () => {
    await setup({ amount: 1, unit: "minutes" }, true);
    expect(screen.getByText("MB_SESSION_TIMEOUT")).toBeInTheDocument();
  });
});
