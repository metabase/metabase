import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { User } from "metabase-types/api/user";
import { createMockState } from "metabase-types/store/mocks/state";

import { CreateMenu } from "./CreateMenu";

const setup = ({ user }: { user?: Partial<User> } = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        snippet_collections: true,
      }),
    }),
    currentUser: createMockUser(user),
  });
  setupEnterprisePlugins();
  return renderWithProviders(<CreateMenu metricCollectionId={1} />, {
    storeInitialState: state,
  });
};

describe("CreateMenu", () => {
  it("renders nothing if menu does not have any options (user lacks permissions)", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("does not render snippet menu items if user only has query builder access", async () => {
    setup({ user: { permissions: { can_create_queries: true } } });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Metric"]);
  });

  it("renders all options when user has full permissions", async () => {
    setup({
      user: {
        is_superuser: true,
        permissions: {
          can_create_queries: true,
          can_create_native_queries: true,
        },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Metric", "Snippet", "Snippet folder"]);
  });
});
