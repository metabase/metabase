import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("PythonTransformsUpsellModal", () => {
  it("renders single-column layout with admin message when hosted and user is not a store user", () => {
    setup({ isHosted: true, isStoreUser: false, isEnterprise: true });

    expect(
      screen.getByRole("heading", {
        name: /Go beyond SQL with advanced transforms/,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Please ask a Metabase Store Admin to enable this for you/,
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: /Add advanced transforms to your plan/,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows cloud purchase content when hosted and user is store user", async () => {
    setup({ isHosted: true, isStoreUser: true, isEnterprise: true });

    expect(
      await screen.findByRole("heading", {
        name: /Add advanced transforms to your plan/,
      }),
    ).toBeInTheDocument();

    expect(await screen.findByText(/SQL \+ Python/)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Confirm purchase/ }),
    ).toBeInTheDocument();
  });

  it("shows upsell store link when instance is self-hosted", async () => {
    setup({
      isHosted: false,
      isStoreUser: true,
      isEnterprise: true,
    });

    const link = await screen.findByRole("link", {
      name: /Go to your store account to purchase/,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://store.staging.metabase.com/account/transforms",
    );
  });
});
