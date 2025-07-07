import { screen } from "@testing-library/react";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("SMTP Override (EE without token)", () => {
  it("should not show SMTP override controls when hosted with enterprise plugins but no cloud-custom-smtp token", () => {
    setup({
      isHosted: true,
      tokenFeatures: {},
    });

    expect(screen.queryByText(/custom smtp server/i)).not.toBeInTheDocument();
  });

  it("should not show SMTP configuration when enabled but no token", () => {
    setup({
      isHosted: true,
      tokenFeatures: {},
      smtpOverrideEnabled: true,
      smtpOverrideConfigured: true,
    });

    expect(screen.queryByText(/custom smtp server/i)).not.toBeInTheDocument();
  });

  it("should not show SMTP override controls even with token features when self-hosted with enterprise plugins", () => {
    setup({
      isHosted: false,
      tokenFeatures: { "cloud-custom-smtp": true },
    });

    expect(screen.queryByText(/custom smtp server/i)).not.toBeInTheDocument();
  });
});
