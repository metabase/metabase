import { setupGsheetsServiceAccountEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  setupGsheetsServiceAccountEndpoint();
  return setup({ ...opts, hasEnterprisePlugins: true });
};

describe("nav > containers > MainNavbar (EE without token)", () => {
  it("should not render 'upload CSV' button", async () => {
    await setupEnterprise({ user: createMockUser({ is_superuser: true }) });
    expect(screen.queryByTestId("dwh-upload-csv")).not.toBeInTheDocument();
  });
});
