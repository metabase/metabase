import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

import { level, setupPicker } from "./setup";

describe("verified questions", () => {
  it("should show a verified icon when showing verified cards", async () => {
    await setupPicker({
      initialValue: { id: 100, model: "card" },
      isEE: true,
    });

    expect(
      await (await level(0)).findByRole("link", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await (await level(1)).findByRole("link", { name: /Collection 4/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await (await level(2)).findByRole("link", { name: /Collection 3/ }),
    ).toHaveAttribute("data-active", "true");

    // question itself should start selected
    expect(
      await (await level(3)).findByRole("link", { name: /Nested Question/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await within(
        await screen.findByRole("link", { name: /My Verified Question/ }),
      ).findByRole("img", { name: /verified_filled/ }),
    ).toBeInTheDocument();
  });
});

describe("tenant collection", () => {
  it("should show tenant collections in the root panel and build a path to a dashboard", async () => {
    await setupPicker({ isEE: true });

    await userEvent.click(
      await screen.findByRole("link", { name: /Shared collections/ }),
    );

    await userEvent.click(await screen.findByRole("link", { name: /tcoll/ }));

    await userEvent.click(
      await screen.findByRole("link", { name: /tsubcoll/ }),
    );

    expect(
      await screen.findByRole("link", { name: /Tenant Question/ }),
    ).toBeInTheDocument();
  });

  it("should handle a tenant question as an initial value", async () => {
    await setupPicker({
      initialValue: {
        model: "card",
        id: 110,
      },
      isEE: true,
    });

    expect(
      await screen.findByRole("link", { name: /Shared collections/ }),
    ).toHaveAttribute("data-active", "true");

    expect(await screen.findByRole("link", { name: /tcoll/ })).toHaveAttribute(
      "data-active",
      "true",
    );

    expect(
      await screen.findByRole("link", { name: /tsubcoll/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Tenant Question/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should handle a tenant dashboard question as an initial value", async () => {
    await setupPicker({
      initialValue: {
        model: "card",
        id: 121,
      },
      isEE: true,
    });

    expect(
      await screen.findByRole("link", { name: /Shared collections/ }),
    ).toHaveAttribute("data-active", "true");

    expect(await screen.findByRole("link", { name: /tcoll/ })).toHaveAttribute(
      "data-active",
      "true",
    );

    expect(
      await screen.findByRole("link", { name: /tsubcoll/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /DQ in TenantDashboard/ }),
    ).toHaveAttribute("data-active", "true");
  });
});
