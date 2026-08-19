import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupEnginesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockEngines } from "metabase-types/api/mocks";

import { DatabasePage } from "./DatabasePage";

jest.mock(
  "docs/databases/connections/postgresql.md",
  () => "Postgres MD Content",
);

const setup = () => {
  setupEnginesEndpoint(createMockEngines());

  renderWithProviders(<Route path="/" element={<DatabasePage />} />, {
    withRouter: true,
    storeInitialState: createMockState(),
  });
};

describe("DatabasePage", () => {
  describe("Help button", () => {
    it("should render the 'Help is here' button", async () => {
      setup();
      expect(
        await screen.findByRole("button", { name: /Help is here/ }),
      ).toBeInTheDocument();
    });

    it("should show the side panel when 'Help is here' button is clicked", async () => {
      setup();
      await userEvent.click(
        await screen.findByRole("button", { name: /Help is here/ }),
      );
      await waitFor(() => {
        expect(
          screen.getByTestId("database-help-side-panel"),
        ).toBeInTheDocument();
      });
    });
  });
});
