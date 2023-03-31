import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import HomeLayout from "./HomeLayout";

interface SetupOpts {
  currentUser?: User;
}

const setup = ({ currentUser }: SetupOpts = {}) => {
  const state = createMockState({
    currentUser,
  });

  renderWithProviders(<HomeLayout />, { storeInitialState: state });
};

describe("HomeLayout", () => {
  it("should render correctly", () => {
    setup({ currentUser: createMockUser({ first_name: "Test" }) });
    expect(screen.getByText(/Test/)).toBeInTheDocument();
  });
});
