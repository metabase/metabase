import userEvent from "@testing-library/user-event";

import { getIcon, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  return setup({
    ...opts,
    enterprisePlugins: ["advanced_permissions", "tenants"],
  });
};

describe("CollectionMenu", () => {
  it("should not be able to make the collection official", async () => {
    setupEnterprise({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });

  it("should not be able to edit permissions for shared tenant collections", async () => {
    setupEnterprise({
      collection: createMockCollection({
        can_write: true,
        namespace: "shared-tenant-collection",
      }),
      isAdmin: true,
      tokenFeatures: createMockTokenFeatures({ tenants: true }),
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Edit permissions")).not.toBeInTheDocument();
  });

  it("should not be able to make shared tenant collections official", async () => {
    setupEnterprise({
      collection: createMockCollection({
        can_write: true,
        namespace: "shared-tenant-collection",
      }),
      isAdmin: true,
      tokenFeatures: createMockTokenFeatures({
        tenants: true,
        official_collections: true,
      }),
    });

    await userEvent.click(getIcon("ellipsis"));

    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });

  it("should not be able to remove official badge from shared tenant collections", async () => {
    setupEnterprise({
      collection: createMockCollection({
        can_write: true,
        namespace: "shared-tenant-collection",
        authority_level: "official",
      }),
      isAdmin: true,
      tokenFeatures: createMockTokenFeatures({
        tenants: true,
        official_collections: true,
      }),
    });

    await userEvent.click(getIcon("ellipsis"));

    expect(screen.queryByText("Remove Official badge")).not.toBeInTheDocument();
  });
});
