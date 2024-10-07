import { screen } from "@testing-library/react";

import { setup } from "./setup";

describe("InsightsTabOrLink (OSS)", () => {
  it("renders a tab for admins", async () => {
    setup({
      enableAuditAppPlugin: false,
      isForADashboard: true,
      isUserAdmin: true,
    });
    const tab = await screen.findByRole("tab");
    expect(tab).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("renders nothing for non-admins", async () => {
    setup({
      enableAuditAppPlugin: false,
      isForADashboard: true,
      isUserAdmin: false,
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
