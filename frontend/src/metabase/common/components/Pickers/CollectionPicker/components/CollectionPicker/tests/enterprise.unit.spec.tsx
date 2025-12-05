import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { SHARED_TENANT_NAMESPACE } from "metabase/common/components/Pickers/utils";

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
      await screen.findByRole("link", { name: /Tenant Collections/ }),
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
      options: { restrictToNamespace: SHARED_TENANT_NAMESPACE },
    });

    // Tenant root should be visible
    expect(
      await screen.findByRole("link", { name: /Tenant Collections/ }),
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
        screen.queryByRole("link", { name: /Tenant Collections/ }),
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
      await screen.findByRole("link", { name: /Tenant Collections/ }),
    ).toBeInTheDocument();
  });
});
