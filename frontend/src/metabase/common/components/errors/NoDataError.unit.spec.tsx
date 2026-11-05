import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { IllustrationSettingValue } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { NoDataError } from "./NoDataError";

const ILLUSTRATION_URL =
  "api/session/illustration/no-data-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  illustration: IllustrationSettingValue;
}

const setup = ({ illustration }: SetupOpts) => {
  const settings = mockSettings({
    "no-data-illustration": illustration,
    "no-data-illustration-custom": ILLUSTRATION_URL,
    "token-features": createMockTokenFeatures({ whitelabel: true }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");

  renderWithProviders(<NoDataError />, { storeInitialState: { settings } });
};

describe("NoDataError (EE with whitelabel)", () => {
  it("should show a custom illustration", () => {
    setup({ illustration: "custom" });

    expect(screen.getByAltText("No results")).toHaveAttribute(
      "src",
      ILLUSTRATION_URL,
    );
  });

  it("should not show an illustration when it is turned off", () => {
    setup({ illustration: "none" });

    expect(screen.queryByAltText("No results")).not.toBeInTheDocument();
  });
});
