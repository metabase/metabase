import { renderWithProviders, screen } from "__support__/ui";
import type { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { HomeGreeting } from "./HomeGreeting";

interface SetupOpts {
  currentUser?: User;
  showLogo?: boolean;
}

const setup = ({ currentUser, showLogo }: SetupOpts) => {
  const state = createMockState({
    currentUser,
    settings: createMockSettingsState({
      "show-metabot": showLogo,
    }),
  });

  renderWithProviders(<HomeGreeting />, { storeInitialState: state });
};

describe("HomeGreeting", () => {
  it("should render with logo", () => {
    setup({
      currentUser: createMockUser({ first_name: "John" }),
      showLogo: true,
    });

    expect(screen.getByText(/John/)).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("should render without logo", () => {
    setup({
      currentUser: createMockUser({ first_name: "John" }),
      showLogo: false,
    });

    expect(screen.getByText(/John/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
