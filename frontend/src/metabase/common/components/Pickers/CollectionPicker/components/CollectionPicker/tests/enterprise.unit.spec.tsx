import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { type SetupOpts, setup as coreSetup } from "./setup";

const setup = (opts: SetupOpts = {}) => coreSetup({ ...opts, ee: true });

describe("tenant collections", () => {
  it("should show tenant collections in the root panel and build a path", async () => {
    setup();

    expect(
      await screen.findByRole("link", { name: /Tenant Collections/ }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", { name: /Tenant Collections/ }),
    );

    expect(
      await screen.findByRole("link", { name: /Shared Tenant Collection/ }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", { name: /Shared Tenant Collection/ }),
    );

    expect(
      await screen.findByRole("link", { name: /Tenant Sub Collection/ }),
    ).toBeInTheDocument();
  });

  it("should handle a tenant collection as an initial value", async () => {
    setup({
      initialValue: {
        model: "collection",
        id: 7,
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
  });
});
