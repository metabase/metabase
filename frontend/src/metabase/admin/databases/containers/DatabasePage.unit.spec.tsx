import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockEngines } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DatabasePage } from "./DatabasePage";

jest.mock(
  "docs/databases/connections/postgresql.md",
  () => "Postgres MD Content",
);

const setup = () => {
  renderWithProviders(<Route path="/" component={DatabasePage} />, {
    withRouter: true,
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
});
