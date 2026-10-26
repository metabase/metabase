import { screen } from "__support__/ui";

import { setup as baseSetup } from "./setup";

const setup = (applicationName: string) =>
  baseSetup({ applicationName, hasWhitelabel: true });

describe("AboutModal (EE with whitelabel)", () => {
  it("should greet with the whitelabeled application name", () => {
    setup("New Test Co");

    expect(
      screen.getByText("Thanks for using New Test Co!"),
    ).toBeInTheDocument();
  });

  it("should hide the trademark notice when the application is renamed", () => {
    setup("New Test Co");

    expect(
      screen.queryByText(/is a Trademark of Metabase, Inc/),
    ).not.toBeInTheDocument();
  });
});
