import { screen } from "@testing-library/react";

import { setup } from "./setup";

describe("SMTP Override (Common)", () => {
  it("should not show SMTP override controls when hosted without enterprise plugins", () => {
    setup({
      hasEnterprisePlugins: false,
      isHosted: true,
      tokenFeatures: {},
    });

    expect(screen.queryByText(/custom smtp server/i)).not.toBeInTheDocument();
  });

  it("should not show SMTP override controls when self-hosted", () => {
    setup({
      hasEnterprisePlugins: true,
      isHosted: false,
      tokenFeatures: { "cloud-custom-smtp": true },
    });

    expect(screen.queryByText(/custom smtp server/i)).not.toBeInTheDocument();
  });

  it("should not show SMTP override controls when hosted without cloud-custom-smtp token feature", () => {
    setup({
      hasEnterprisePlugins: true,
      isHosted: true,
      tokenFeatures: {},
    });

    expect(screen.queryByText(/custom smtp server/i)).not.toBeInTheDocument();
  });
});
