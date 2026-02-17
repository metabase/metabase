import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("PythonTransformsUpsellModal - EE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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
      screen.getByRole("heading", {
        name: /Add advanced transforms to your plan/,
      }),
    ).toBeInTheDocument();

    expect(await screen.findByText(/SQL \+ Python/)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Confirm purchase/ }),
    ).toBeInTheDocument();
  });

  it("shows upsell CTA when instance is self-hosted and clicking it closes modal", async () => {
    const { onClose } = setup({
      isHosted: false,
      isStoreUser: true,
      isEnterprise: true,
    });

    await screen.findByRole("button", { name: /Get Python transforms/ });

    await userEvent.click(
      screen.getByRole("button", { name: /Get Python transforms/ }),
    );

    expect(onClose).toHaveBeenCalled();
  });
});
