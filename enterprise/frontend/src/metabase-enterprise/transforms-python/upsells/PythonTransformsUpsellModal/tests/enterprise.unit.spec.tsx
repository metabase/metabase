import { screen, waitFor } from "__support__/ui";

import { setup } from "./setup";

async function waitForLoadingToFinish() {
  await waitFor(() => {
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
}

describe("PythonTransformsUpsellModal", () => {
  it("renders single-column layout with admin message when hosted user is not an admin or store user", async () => {
    setup({
      isHosted: true,
      isAdmin: false,
      isStoreUser: false,
      isEnterprise: true,
    });
    await waitForLoadingToFinish();

    expect(
      screen.getByRole("heading", {
        name: /Go beyond SQL with advanced transforms/,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Please ask a Store Admin to enable this for you/),
    ).toBeInTheDocument();
  });

  it("shows cloud purchase content when hosted user is an admin", async () => {
    setup({
      isHosted: true,
      isAdmin: true,
      isStoreUser: false,
      isEnterprise: true,
    });
    await waitForLoadingToFinish();

    expect(
      screen.getByText(
        "1k advanced transforms included, then 2¢ per transform run.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upgrade/ })).toBeInTheDocument();
  });

  it("shows cloud purchase content when hosted and user is store user", async () => {
    setup({ isHosted: true, isStoreUser: true, isEnterprise: true });
    await waitForLoadingToFinish();

    expect(
      screen.getByText(
        "1k advanced transforms included, then 2¢ per transform run.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upgrade/ })).toBeInTheDocument();
  });

  it("shows upsell store link when instance is self-hosted", async () => {
    setup({
      isHosted: false,
      isStoreUser: true,
      isEnterprise: true,
    });
    await waitForLoadingToFinish();

    const link = await screen.findByRole("link", {
      name: /Go to your store account to upgrade/,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://store.staging.metabase.com/account/transforms",
    );
  });
});
