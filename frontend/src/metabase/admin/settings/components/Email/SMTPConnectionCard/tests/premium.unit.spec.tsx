import { screen } from "@testing-library/react";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

async function setup(opts: SetupOpts = {}) {
  return baseSetup({ enterprisePlugins: ["smtp-override"], ...opts });
}

describe("SMTPConnectionCard (EE with token)", () => {
  it("should show the cloud SMTP card when hosted", async () => {
    await setup({
      isHosted: true,
      tokenFeatures: { cloud_custom_smtp: true },
    });

    expect(
      screen.getByTestId("cloud-smtp-connection-card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("self-hosted-smtp-connection-card"),
    ).not.toBeInTheDocument();
  });

  it("should show self-hosted SMTP card when self-hoste", () => {
    setup({
      isHosted: false,
      tokenFeatures: { cloud_custom_smtp: true },
    });

    expect(
      screen.getByTestId("self-hosted-smtp-connection-card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-smtp-connection-card"),
    ).not.toBeInTheDocument();
  });
});
