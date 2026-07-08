import { screen } from "@testing-library/react";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({ ...opts });
}

describe("SSMTPConnectionCard (EE without token)", () => {
  it("should not show any SMTP card without token", () => {
    setup({
      isHosted: true,
      tokenFeatures: {},
    });

    expect(
      screen.queryByTestId("self-hosted-smtp-connection-card"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-smtp-connection-card"),
    ).not.toBeInTheDocument();
  });

  it("should not show any SMTP card when override enabled but no token", () => {
    setup({
      isHosted: true,
      tokenFeatures: {},
      smtpOverrideEnabled: true,
    });

    expect(
      screen.queryByTestId("self-hosted-smtp-connection-card"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-smtp-connection-card"),
    ).not.toBeInTheDocument();
  });
});
