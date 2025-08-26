import { screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("nav > containers > MainNavbar (EE with token) > Getting Started section", () => {
  it("shows embedding hub if feature is present", async () => {
    await setup({
      hasEnterprisePlugins: true,
      hasEmbeddingFeature: true,
      user: createMockUser({ is_superuser: true }),
    });

    expect(
      screen.getByRole("link", { name: "Embedding hub" }),
    ).toBeInTheDocument();
  });

  it("hides embedding hub if feature is not present", async () => {
    await setup({
      hasEnterprisePlugins: true,
      hasEmbeddingFeature: false,
      user: createMockUser({ is_superuser: true }),
    });

    expect(
      screen.queryByRole("link", { name: "Embedding hub" }),
    ).not.toBeInTheDocument();
  });

  it("hides embedding hub if user is not admin", async () => {
    await setup({
      hasEnterprisePlugins: true,
      hasEmbeddingFeature: true,
      user: createMockUser({ is_superuser: false }),
    });

    expect(
      screen.queryByRole("link", { name: "Embedding hub" }),
    ).not.toBeInTheDocument();
  });
});
