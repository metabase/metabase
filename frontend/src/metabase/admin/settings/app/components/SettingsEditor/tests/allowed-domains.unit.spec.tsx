import { screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EMAIL_URL, setup } from "./setup";

async function setupAllowedDomains() {
  await setup({
    hasEnterprisePlugins: true,
    tokenFeatures: createMockTokenFeatures({ email_allow_list: true }),
    settings: [
      createMockSettingDefinition({ key: "subscription-allowed-domains" }),
      createMockSettingDefinition({ key: "email-configured?" }),
    ],
    settingValues: createMockSettings({
      "subscription-allowed-domains": "somedomain.com",
      "email-configured?": true,
    }),
    initialRoute: EMAIL_URL,
  });
}

describe("SettingsEditor", () => {
  it("should allow the user to input a list of allowed email domains for subscriptions", async () => {
    await setupAllowedDomains();

    expect(
      screen.getByText(/approved domains for notifications/i),
    ).toBeInTheDocument();
  });
});
