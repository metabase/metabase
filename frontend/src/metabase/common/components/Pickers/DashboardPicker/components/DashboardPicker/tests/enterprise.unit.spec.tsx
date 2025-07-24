import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { type SetupOpts, setupPicker } from "./setup";

const setup = (opts: SetupOpts = {}) => setupPicker({ ...opts, ee: true });

describe("tenant collections", () => {
  it("should show tenant collections in the root panel and build a path to a dashboard", async () => {
    await setup();

    await userEvent.click(
      await screen.findByRole("link", { name: /Tenant Collections/ }),
    );

    await userEvent.click(
      await screen.findByRole("link", { name: /Shared Tenant Collection/ }),
    );

    await userEvent.click(
      await screen.findByRole("link", { name: /Tenant Sub Collection/ }),
    );

    expect(
      await screen.findByRole("link", { name: /Shared Dashboard/ }),
    ).toBeInTheDocument();
  });

  it("should handle a tenant tenant as an initial value", async () => {
    await setup({
      initialValue: {
        model: "dashboard",
        id: 102,
      },
    });

    expect(
      await screen.findByRole("link", { name: /Tenant Collections/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Shared Tenant Collection/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Tenant Sub Collection/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Shared Dashboard/ }),
    ).toHaveAttribute("data-active", "true");
  });
});
