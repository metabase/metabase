import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockEngines } from "metabase-types/api/mocks";

import { DatabasePage } from "./DatabasePage";

jest.mock(
  "docs/databases/connections/postgresql.md",
  () => "Postgres MD Content",
);

const setup = ({
  initialRoute = "/",
  routePath = "/",
}: { initialRoute?: string; routePath?: string } = {}) => {
  renderWithProviders(<Route path={routePath} component={DatabasePage} />, {
    withRouter: true,
    initialRoute,
    storeInitialState: createMockState({
      settings: mockSettings({
        engines: createMockEngines(),
      }),
    }),
  });
};

describe("DatabasePage", () => {
  describe("Help button", () => {
    it("should render the 'Help is here' button", () => {
      setup();
      expect(
        screen.getByRole("button", { name: /Help is here/ }),
      ).toBeInTheDocument();
    });

    it("should show the side panel when 'Help is here' button is clicked", async () => {
      setup();
      await userEvent.click(
        screen.getByRole("button", { name: /Help is here/ }),
      );
      await waitFor(() => {
        expect(
          screen.getByTestId("database-help-side-panel"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("non-existing database (metabase#11037)", () => {
    it("renders the backend error message when the database is not found", async () => {
      fetchMock.get("path:/api/database/999", {
        status: 404,
        body: { message: "Not found." },
      });

      setup({
        routePath: "/admin/databases/:databaseId",
        initialRoute: "/admin/databases/999",
      });

      expect(await screen.findByText("Not found.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });
});
