import { screen, within } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

function setupPremium(opts: SetupOpts) {
  return setup({
    hasEnterprisePlugins: true,
    hasDWHAttached: true,
    ...opts,
  });
}

describe("nav > containers > MainNavbar (EE with token)", () => {
  it("should render 'upload CSV' button to admins", async () => {
    await setupPremium({
      user: createMockUser({ is_superuser: true }),
    });
    const nav = screen.getByTestId("main-navbar-root");
    expect(within(nav).getByText("Upload CSV")).toBeInTheDocument();
  });

  it("should render 'upload CSV' button to regular users who have sufficient permissions", async () => {
    await setupPremium({
      canCurateRootCollection: true,
      isUploadEnabled: true,
      user: createMockUser({ is_superuser: false }),
    });
    const nav = screen.getByTestId("main-navbar-root");
    expect(within(nav).getByText("Upload CSV")).toBeInTheDocument();
  });

  it("should not render 'upload CSV' button to regular users who lack root collection permissions", async () => {
    await setupPremium({
      canCurateRootCollection: false,
      isUploadEnabled: true,
      user: createMockUser({ is_superuser: false }),
    });

    expect(screen.queryByTestId("dwh-upload-csv")).not.toBeInTheDocument();
  });

  it("should not render 'upload CSV' button to regular users who lack data access permissions", async () => {
    await setupPremium({
      canCurateRootCollection: true,
      hasDataAccess: false,
      isUploadEnabled: true,
      user: createMockUser({ is_superuser: false }),
    });

    expect(screen.queryByTestId("dwh-upload-csv")).not.toBeInTheDocument();
  });
});
