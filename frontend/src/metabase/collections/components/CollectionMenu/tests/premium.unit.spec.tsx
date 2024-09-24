import userEvent from "@testing-library/user-event";

import { getIcon, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  return setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ official_collections: true }),
    hasEnterprisePlugins: true,
  });
};

describe("CollectionMenu", () => {
  it("should be able to make the collection official", async () => {
    const collection = createMockCollection({
      can_write: true,
    });
    const { onUpdateCollection } = setupPremium({
      collection,
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(await screen.findByText("Make official"));
    expect(onUpdateCollection).toHaveBeenCalledWith(collection, {
      authority_level: "official",
    });
  });

  it("should be able to make the collection regular", async () => {
    const collection = createMockCollection({
      can_write: true,
      authority_level: "official",
    });
    const { onUpdateCollection } = setupPremium({
      collection,
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    await userEvent.click(await screen.findByText("Remove Official badge"));
    expect(onUpdateCollection).toHaveBeenCalledWith(collection, {
      authority_level: null,
    });
  });

  it("should not be able to make the collection official if not an admin", async () => {
    const collection = createMockCollection({
      can_write: true,
    });
    setupPremium({
      collection,
      isAdmin: false,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Make official")).not.toBeInTheDocument();
  });

  it("should not be able to make the collection official if it's the root collection", async () => {
    const collection = createMockCollection({
      id: "root",
      can_write: true,
    });
    setupPremium({
      collection,
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Make official")).not.toBeInTheDocument();
  });

  it("should be able to make the collection official if it's a personal collection", async () => {
    const collection = createMockCollection({
      personal_owner_id: 1,
      can_write: true,
    });
    setupPremium({
      collection,
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Make official")).toBeInTheDocument();
  });

  it("should be able to make the collection official if even it's a personal collection child", async () => {
    const collection = createMockCollection({
      can_write: true,
    });
    setupPremium({
      collection,
      isAdmin: true,
      isPersonalCollectionChild: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(screen.getByText("Make official")).toBeInTheDocument();
  });
});
