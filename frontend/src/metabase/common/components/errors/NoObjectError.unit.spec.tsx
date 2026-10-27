import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  EnterpriseSettings,
  IllustrationSettingValue,
} from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { NoObjectError } from "./NoObjectError";

const CUSTOM_ILLUSTRATION_URL =
  "api/session/illustration/no-object-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  illustration?: IllustrationSettingValue;
  customIllustrationUrl?: EnterpriseSettings["no-object-illustration-custom"];
}

const setup = ({
  illustration = "default",
  customIllustrationUrl = CUSTOM_ILLUSTRATION_URL,
}: SetupOpts = {}) => {
  // mockSettings seeds the MetabaseSettings singleton that the plugin's own
  // feature check reads, so it has to run before the plugin initializes.
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ whitelabel: true }),
      "no-object-illustration": illustration,
      "no-object-illustration-custom": customIllustrationUrl,
    }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");

  renderWithProviders(<NoObjectError />, { storeInitialState: state });
};

describe("NoObjectError", () => {
  it("should show the default sailboat illustration", () => {
    setup({ illustration: "default" });

    const image = screen.getByAltText("Nothing found");
    expect(image).toBeInTheDocument();
    expect(image).not.toHaveAttribute("src", CUSTOM_ILLUSTRATION_URL);
  });

  it("should show the custom illustration when one is uploaded", () => {
    setup({ illustration: "custom" });

    expect(screen.getByAltText("Nothing found")).toHaveAttribute(
      "src",
      CUSTOM_ILLUSTRATION_URL,
    );
  });

  it("should show no illustration when the setting is 'none'", () => {
    setup({ illustration: "none" });

    expect(screen.queryByAltText("Nothing found")).not.toBeInTheDocument();
  });

  it("should show no illustration when 'custom' is selected but nothing is uploaded", () => {
    setup({ illustration: "custom", customIllustrationUrl: "" });

    expect(screen.queryByAltText("Nothing found")).not.toBeInTheDocument();
  });
});
