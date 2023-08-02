import userEvent from "@testing-library/user-event";
import { createMockCollection } from "metabase-types/api/mocks";
import { getIcon, screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  return setup({ ...opts, hasEnterprisePlugins: true });
};

describe("CollectionMenu", () => {
  it("should not be able to make the collection official", () => {
    setupEnterprise({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
    });

    userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });
});
