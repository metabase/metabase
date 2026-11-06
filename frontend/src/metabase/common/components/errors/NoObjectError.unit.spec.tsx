import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { IllustrationSettingValue } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { NoObjectError } from "./NoObjectError";

const ILLUSTRATION_URL =
  "api/session/illustration/no-object-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  illustration: IllustrationSettingValue;
}

const setup = ({ illustration }: SetupOpts) => {
  const settings = mockSettings({
    "no-object-illustration": illustration,
    "no-object-illustration-custom": ILLUSTRATION_URL,
    "token-features": createMockTokenFeatures({ whitelabel: true }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");

  renderWithProviders(<NoObjectError />, { storeInitialState: { settings } });
};

describe("NoObjectError (EE with whitelabel)", () => {
  it("should show a custom illustration", () => {
    setup({ illustration: "custom" });

    expect(screen.getByAltText("Nothing found")).toHaveAttribute(
      "src",
      ILLUSTRATION_URL,
    );
  });

  it("should not show an illustration when it is turned off", () => {
    setup({ illustration: "none" });

    expect(screen.queryByAltText("Nothing found")).not.toBeInTheDocument();
  });
});
