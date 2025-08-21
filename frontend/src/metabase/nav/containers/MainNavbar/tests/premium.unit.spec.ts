import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("nav > containers > MainNavbar (EE with token) > Getting Started section", () => {
  it("shows embedding hub if feature is present", async () => {
    await setup({ hasEnterprisePlugins: true, hasEmbeddingHubFeature: true });

    expect(
      screen.getByRole("link", { name: "Embedding hub" }),
    ).toBeInTheDocument();
  });

  it("hides embedding hub if feature is not present", async () => {
    await setup({ hasEnterprisePlugins: true, hasEmbeddingHubFeature: false });

    expect(
      screen.queryByRole("link", { name: "Embedding hub" }),
    ).not.toBeInTheDocument();
  });
});
