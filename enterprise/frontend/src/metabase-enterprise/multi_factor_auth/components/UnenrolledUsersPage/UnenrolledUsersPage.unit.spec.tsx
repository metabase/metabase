import userEvent from "@testing-library/user-event";

import {
  setupMfaUnenrolledUsersEndpoint,
  setupMfaUnenrolledUsersEndpointError,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { MfaAdminUser } from "metabase-types/api";

import { UnenrolledUsersPage } from "./UnenrolledUsersPage";

type SetupOpts = {
  users?: MfaAdminUser[];
  hasError?: boolean;
};

function setup({ users = [], hasError = false }: SetupOpts = {}) {
  // TreeTable virtualizes rows, so the container needs a measurable size
  mockGetBoundingClientRect({ width: 800, height: 600 });

  if (hasError) {
    setupMfaUnenrolledUsersEndpointError();
  } else {
    setupMfaUnenrolledUsersEndpoint(users);
  }

  renderWithProviders(<UnenrolledUsersPage />, { withRouter: true });
}

describe("UnenrolledUsersPage", () => {
  it("distinguishes everyone being enrolled from a search that matches nobody", async () => {
    setup({ users: [] });

    expect(await screen.findByText("No unenrolled users")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search…"), "nobody");

    expect(await screen.findByText("No results found")).toBeInTheDocument();
    expect(screen.queryByText("No unenrolled users")).not.toBeInTheDocument();
  });

  it("shows an error state instead of an empty table when the request fails", async () => {
    setup({ hasError: true });

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    // an empty table here would wrongly read as "everyone has 2FA set up"
    expect(
      screen.queryByTestId("mfa-unenrolled-users-table"),
    ).not.toBeInTheDocument();
  });
});
