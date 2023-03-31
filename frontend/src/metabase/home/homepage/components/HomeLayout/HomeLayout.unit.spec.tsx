import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import HomeLayout from "./HomeLayout";

const TEST_USER = createMockUser({
  first_name: "Testy",
});

const setup = () => {
  renderWithProviders(<HomeLayout />, {
    storeInitialState: { currentUser: TEST_USER },
  });
};

describe("HomeLayout", () => {
  it("should render correctly", () => {
    setup();
    expect(screen.getByText(/Testy/)).toBeInTheDocument();
  });
});
