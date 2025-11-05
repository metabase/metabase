import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("DashboardEntityIdCard (EE without token)", () => {
  it("should return null", async () => {
    setup({ hasEnterprisePlugins: true });
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
