import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupMfaUnenrolledUsersEndpoint,
  setupMfaUnenrolledUsersEndpointError,
  setupMfaUnenrolledUsersSearchEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { MfaAdminUser } from "metabase-types/api";
import { createMockMfaEnrolledUser } from "metabase-types/api/mocks";

import { UnenrolledUsersPage } from "./UnenrolledUsersPage";

// The search debounce is idle time in these tests: they assert what a search
// returns, not that the input waits before it asks.
jest.mock("metabase/utils/constants", () => ({
  ...jest.requireActual("metabase/utils/constants"),
  SEARCH_DEBOUNCE_DURATION: 0,
}));

const NO_DATA_USER: MfaAdminUser = createMockMfaEnrolledUser({
  id: 3,
  first_name: "No",
  last_name: "Data",
  common_name: "No Data",
  email: "nodata@metabase.test",
});

const ADMIN_USER: MfaAdminUser = createMockMfaEnrolledUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
  email: "admin@metabase.test",
  is_superuser: true,
});

type SetupOpts = {
  users?: MfaAdminUser[];
  hasError?: boolean;
  isSearchable?: boolean;
};

function setup({
  users = [],
  hasError = false,
  isSearchable = false,
}: SetupOpts = {}) {
  // TreeTable virtualizes rows, so the container needs a measurable size
  mockGetBoundingClientRect({ width: 800, height: 600 });

  if (hasError) {
    setupMfaUnenrolledUsersEndpointError();
  } else if (isSearchable) {
    setupMfaUnenrolledUsersSearchEndpoint(users);
  } else {
    setupMfaUnenrolledUsersEndpoint(users);
  }

  renderWithProviders(<UnenrolledUsersPage />, { withRouter: true });
}

function lastListQuery() {
  const url = fetchMock.callHistory
    .calls("path:/api/ee/mfa/admin/unenrolled-users")
    .at(-1)?.url;
  return url ? new URL(url).searchParams.get("query") : undefined;
}

describe("UnenrolledUsersPage", () => {
  it("lists the users without 2FA and narrows the list to the searched person", async () => {
    setup({ users: [NO_DATA_USER, ADMIN_USER], isSearchable: true });

    const table = await screen.findByTestId("mfa-unenrolled-users-table");
    expect(
      await within(table).findByText("nodata@metabase.test"),
    ).toBeInTheDocument();
    expect(within(table).getByText("admin@metabase.test")).toBeInTheDocument();
    expect(lastListQuery()).toBeNull();

    await userEvent.type(screen.getByPlaceholderText("Search…"), "Bobby");

    await waitFor(() => expect(lastListQuery()).toBe("Bobby"));
    await waitFor(() => {
      expect(
        within(screen.getByTestId("mfa-unenrolled-users-table")).queryByText(
          "nodata@metabase.test",
        ),
      ).not.toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("mfa-unenrolled-users-table")).getByText(
        "admin@metabase.test",
      ),
    ).toBeInTheDocument();
  });

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
