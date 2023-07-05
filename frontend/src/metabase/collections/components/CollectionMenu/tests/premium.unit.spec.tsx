import userEvent from "@testing-library/user-event";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  return setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ content_management: true }),
    hasEnterprisePlugins: true,
  });
};

describe("CollectionMenu", () => {
  it("should be able to make the collection official", () => {
    const collection = createMockCollection({
      can_write: true,
    });
    const { onUpdateCollection } = setupPremium({
      collection,
      isAdmin: true,
    });

    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Make collection official"));
    expect(onUpdateCollection).toHaveBeenCalledWith(collection, {
      authority_level: "official",
    });
  });

  it("should be able to make the collection regular", () => {
    const collection = createMockCollection({
      can_write: true,
      authority_level: "official",
    });
    const { onUpdateCollection } = setupPremium({
      collection,
      isAdmin: true,
    });

    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Remove Official badge"));
    expect(onUpdateCollection).toHaveBeenCalledWith(collection, {
      authority_level: null,
    });
  });
});
