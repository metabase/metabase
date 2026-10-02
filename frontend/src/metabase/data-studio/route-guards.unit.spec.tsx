import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { TokenFeatures, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { CanAccessDataStudio } from "./route-guards";

interface SetupOpts {
  user: Partial<User>;
  tokenFeatures?: Partial<TokenFeatures>;
}

const setup = ({ user, tokenFeatures = {} }: SetupOpts) =>
  renderWithProviders(
    <>
      <Route element={<CanAccessDataStudio />}>
        <Route path="/data-studio" element={<div>data studio page</div>} />
      </Route>
      <Route path="/unauthorized" element={<div>unauthorized</div>} />
    </>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser(user),
        settings: mockSettings({
          "has-user-setup": true,
          "token-features": createMockTokenFeatures(tokenFeatures),
        }),
      }),
      withRouter: true,
      initialRoute: "/data-studio",
    },
  );

describe("CanAccessDataStudio", () => {
  it("renders for analysts when advanced-permissions is available", () => {
    setup({
      user: { is_data_analyst: true, is_superuser: false },
      tokenFeatures: { advanced_permissions: true },
    });

    expect(screen.getByText("data studio page")).toBeInTheDocument();
  });

  it("redirects analysts to unauthorized when advanced-permissions is absent", async () => {
    const { router } = setup({
      user: { is_data_analyst: true, is_superuser: false },
      tokenFeatures: { advanced_permissions: false },
    });

    await waitFor(() => {
      expect(router?.location.pathname).toBe("/unauthorized");
    });
  });

  it("renders for admins when advanced-permissions is absent", () => {
    setup({
      user: { is_data_analyst: false, is_superuser: true },
      tokenFeatures: { advanced_permissions: false },
    });

    expect(screen.getByText("data studio page")).toBeInTheDocument();
  });

  it("redirects users who are neither admins nor analysts", async () => {
    const { router } = setup({
      user: { is_data_analyst: false, is_superuser: false },
      tokenFeatures: { advanced_permissions: true },
    });

    await waitFor(() => {
      expect(router?.location.pathname).toBe("/unauthorized");
    });
  });
});
