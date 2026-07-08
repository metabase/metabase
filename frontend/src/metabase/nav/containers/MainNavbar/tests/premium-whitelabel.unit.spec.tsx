import { screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

function setupWhitelabelled(opts: SetupOpts) {
  return setup({
    hasWhitelabelToken: true,
    enterprisePlugins: ["whitelabel"],
    ...opts,
  });
}

describe("nav > containers > MainNavbar (EE with token) > Getting Started section", () => {
  it("should render if the instance has the `whitelabel` token feature but didn't change the application name", async () => {
    await setupWhitelabelled({
      user: createMockUser({ is_superuser: true }),
      applicationName: "Metabase",
    });
    const section = screen.getByRole("tab", {
      name: /^Getting Started/i,
    });
    expect(section).toBeInTheDocument();
  });

  it("should not render if the instance application name has changed", async () => {
    await setupWhitelabelled({
      user: createMockUser({ is_superuser: true }),
      applicationName: "FooBar, Inc.",
    });
    const section = screen.queryByRole("tab", {
      name: /^Getting Started/i,
    });
    expect(section).not.toBeInTheDocument();
  });
});
