import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { getIcon, screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  return setup({ ...opts, hasEnterprisePlugins: true });
};

describe("CollectionMenu", () => {
  it("should not be able to make the collection official", async () => {
    fetchMock.get("path:/api/collection/1/items", {
      data: [],
      models: [],
      total: 10,
    });

    setupEnterprise({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
    });

    await userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Make official")).not.toBeInTheDocument();
  });
});
