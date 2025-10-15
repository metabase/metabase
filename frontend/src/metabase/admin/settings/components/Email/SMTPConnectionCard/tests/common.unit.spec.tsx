import { screen } from "@testing-library/react";

import { setup } from "./setup";

describe("SMTPConnectionCard (Common)", () => {
  it("should render SelfHostedSMTPConnectionCard if self-hosted", async () => {
    await setup({ isHosted: false });
    expect(
      screen.getByTestId("self-hosted-smtp-connection-card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-smtp-connection-card"),
    ).not.toBeInTheDocument();
  });

  it("should not render anything if hosted (no token feature)", async () => {
    await setup({ isHosted: true });
    expect(
      screen.queryByTestId("self-hosted-smtp-connection-card"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-smtp-connection-card"),
    ).not.toBeInTheDocument();
  });
});
