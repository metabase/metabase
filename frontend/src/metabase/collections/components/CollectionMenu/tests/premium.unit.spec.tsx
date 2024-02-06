import userEvent from "@testing-library/user-event";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { getIcon, queryIcon, screen } from "__support__/ui";
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

    userEvent.click(getIcon("ellipsis"));
    userEvent.click(await screen.findByText("Make collection official"));
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

    userEvent.click(getIcon("ellipsis"));
    userEvent.click(await screen.findByText("Remove Official badge"));
    expect(onUpdateCollection).toHaveBeenCalledWith(collection, {
      authority_level: null,
    });
  });

  it("should not be able to make the collection official if not an admin", () => {
    const collection = createMockCollection({
      can_write: true,
    });
    setupPremium({
      collection,
      isAdmin: false,
    });

    userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });

  it("should not be able to make the collection official if it's the root collection", () => {
    const collection = createMockCollection({
      id: "root",
      can_write: true,
    });
    setupPremium({
      collection,
      isAdmin: true,
    });

    userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });

  it("should not be able to make the collection official if it's a personal collection", () => {
    const collection = createMockCollection({
      personal_owner_id: 1,
      can_write: true,
    });
    setupPremium({
      collection,
      isAdmin: true,
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to make the collection official if it's a personal collection child", () => {
    const collection = createMockCollection({
      can_write: true,
    });
    setupPremium({
      collection,
      isAdmin: true,
      isPersonalCollectionChild: true,
    });

    userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });
});
