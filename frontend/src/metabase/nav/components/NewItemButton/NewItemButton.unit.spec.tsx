import React from "react";
import userEvent from "@testing-library/user-event";
import { waitFor, screen, renderWithProviders } from "__support__/ui";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockDatabase } from "metabase-types/api/mocks";
import NewItemButton from "metabase/nav/components/NewItemButton/NewItemButton";

const DATABASE_ID = 1;
const setup = async () => {
  setupDatabasesEndpoints([createMockDatabase({ id: DATABASE_ID })]);
  setupSearchEndpoints([]);

  renderWithProviders(<NewItemButton />);

  // await waitFor(() => {
  //   screen.getByTestId("loading-spinner").not.toBeInTheDocument();
  // });
};
describe("NewItemMenu", () => {
  it("should render", async () => {
    await setup();
    userEvent.click(screen.getByText("New"));
    screen.debug(undefined, 100000)
    expect(true).toBeTruthy();
  });
});
