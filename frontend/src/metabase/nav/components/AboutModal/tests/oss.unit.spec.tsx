import { screen } from "__support__/ui";

import { setup as baseSetup } from "./setup";

describe("AboutModal (OSS)", () => {
  it("should ignore the application name without the whitelabel feature", () => {
    baseSetup({ applicationName: "New Test Co", hasWhitelabel: false });

    expect(screen.getByText("Thanks for using Metabase!")).toBeInTheDocument();
    expect(
      screen.getByText(/is a Trademark of Metabase, Inc/),
    ).toBeInTheDocument();
  });
});
