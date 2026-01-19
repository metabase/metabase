import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { PLUGIN_TENANTS } from "metabase/plugins";

import { type SetupOpts, setup as coreSetup } from "./setup";

const setup = (opts: SetupOpts = {}) => coreSetup({ ...opts, ee: true });

describe("tenant collections", () => {
  it("should show tenant collections in the root panel and build a path", async () => {
    setup();

    expect(
      await screen.findByRole("link", { name: /Shared collections/ }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", { name: /Shared collections/ }),
    );

    expect(
      await screen.findByRole("link", { name: /tcoll/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /tcol/ }));

    expect(
      await screen.findByRole("link", { name: /tsubcol/ }),
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
      await screen.findByRole("link", { name: /Shared collections/ }),
    ).toHaveAttribute("data-active", "true");

    expect(await screen.findByRole("link", { name: /tcol/ })).toHaveAttribute(
      "data-active",
      "true",
    );

    expect(
      await screen.findByRole("link", { name: /tsubcol/ }),
    ).toHaveAttribute("data-active", "true");
  });
});

describe("restrictToNamespace option", () => {
  it("should only show tenant collections when restricted to shared-tenant-collection namespace", async () => {
    setup({
      options: {
        restrictToNamespace:
          PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE ?? undefined,
      },
    });

    // Tenant root should be visible
    expect(
      await screen.findByRole("link", { name: /Shared collections/ }),
    ).toBeInTheDocument();

    // Regular collections should NOT be visible
    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: /Our Analytics/ }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: /My personal collection/ }),
    ).not.toBeInTheDocument();
  });

  it("should hide tenant collections when restricted to default namespace", async () => {
    setup({
      options: {
        restrictToNamespace: "default",
        showRootCollection: true,
        showPersonalCollections: true,
      },
    });

    // Regular collections should be visible
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toBeInTheDocument();

    // Tenant root should NOT be visible
    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: /Shared collections/ }),
      ).not.toBeInTheDocument();
    });
  });

  it("should show all collections when restrictToNamespace is not set", async () => {
    setup({
      options: {
        showRootCollection: true,
        showPersonalCollections: true,
      },
    });

    // Both regular and tenant collections should be visible
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Shared collections/ }),
    ).toBeInTheDocument();
  });
});
