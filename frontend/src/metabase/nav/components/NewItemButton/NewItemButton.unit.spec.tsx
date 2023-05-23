import React from "react";
import userEvent from "@testing-library/user-event";
import { screen, renderWithProviders } from "__support__/ui";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockDatabase } from "metabase-types/api/mocks";
import CollectionLanding from "metabase/collections/components/CollectionLanding";
import { Route } from "metabase/hoc/Title";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";

const DATABASE_ID = 1;
const setup = async () => {
  setupDatabasesEndpoints([
    createMockDatabase({
      id: DATABASE_ID,
      native_permissions: "write",
      is_saved_questions: true,
      settings: {
        "database-enable-actions": true,
      },
    }),
  ]);
  setupSearchEndpoints([]);

  renderWithProviders(
    <>
      <Route path="collection/:slug" component={CollectionLanding} />
      <Route path="/question" component={QueryBuilder} />
    </>,
  );

  // await waitFor(() => {
  //   screen.getByTestId("loading-spinner").not.toBeInTheDocument();
  // });
};
describe("NewItemMenu", () => {
  it("should render", async () => {
    await setup();
    userEvent.click(screen.getByText("New"));
    screen.debug(undefined, 100000);
    expect(true).toBeTruthy();
  });
});
