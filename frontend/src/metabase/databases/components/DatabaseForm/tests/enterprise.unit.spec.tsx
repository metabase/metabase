import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  return setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

describe("DatabaseForm", () => {
  it("should not allow to configure cache ttl", async () => {
    setupEnterprise({ isCachingEnabled: true });
    await userEvent.click(screen.getByText("Show advanced options"));
    expect(
      screen.getByText("Choose when syncs and scans happen"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Default result cache duration"),
    ).not.toBeInTheDocument();
  });
});
