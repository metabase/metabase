import { renderWithProviders, screen } from "__support__/ui";
import type { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { HomeLayout } from "./HomeLayout";

interface SetupOpts {
  currentUser?: User;
}

const setup = ({ currentUser }: SetupOpts = {}) => {
  const state = createMockState({
    currentUser,
  });

  renderWithProviders(<HomeLayout hasMetabot={false} />, {
    storeInitialState: state,
  });
};

describe("HomeLayout", () => {
  it("should render correctly", () => {
    setup({ currentUser: createMockUser({ first_name: "Test" }) });
    expect(screen.getByText(/Test/)).toBeInTheDocument();
  });

  it("should show customize button when user is an admin", () => {
    setup({
      currentUser: createMockUser({ first_name: "Test", is_superuser: true }),
    });
    expect(screen.getByText(/Customize/)).toBeInTheDocument();
  });

  it("should not show customize button when user is not an admin", () => {
    setup({
      currentUser: createMockUser({ first_name: "Test", is_superuser: false }),
    });
    expect(screen.queryByText(/Customize/)).not.toBeInTheDocument();
  });
});
