import { screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EMAIL_URL, setup } from "./setup";

async function setupUserVisibility() {
  await setup({
    hasEnterprisePlugins: true,
    tokenFeatures: createMockTokenFeatures({ email_restrict_recipients: true }),
    settings: [
      createMockSettingDefinition({ key: "user-visibility" }),
      createMockSettingDefinition({ key: "email-configured?" }),
    ],
    settingValues: createMockSettings({
      "user-visibility": "all",
      "email-configured?": true,
    }),
    initialRoute: EMAIL_URL,
  });
}

describe("SettingsEditor", () => {
  it("should allow the user to input a list of allowed email domains for subscriptions", async () => {
    await setupUserVisibility();

    expect(
      screen.getByText(
        /suggest recipients on dashboard subscriptions and alerts/i,
      ),
    ).toBeInTheDocument();
  });
});
