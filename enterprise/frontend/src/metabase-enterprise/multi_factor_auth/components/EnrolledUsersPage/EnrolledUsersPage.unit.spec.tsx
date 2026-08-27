import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupMfaAdminRemoveEndpoint,
  setupMfaEnrolledUsersEndpoint,
  setupMfaEnrolledUsersEndpointError,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { MfaEnrolledUser } from "metabase-types/api";
import {
  createMockMfaEnrolledUser,
  createMockUser,
} from "metabase-types/api/mocks";

import { EnrolledUsersPage } from "./EnrolledUsersPage";

const CURRENT_USER_ID = 1;

const OTHER_USER = createMockMfaEnrolledUser({
  id: 2,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
  email: "bobby@metabase.test",
});

type SetupOpts = {
  users?: MfaEnrolledUser[];
  hasError?: boolean;
};

function setup({ users = [OTHER_USER], hasError = false }: SetupOpts = {}) {
  // TreeTable virtualizes rows, so the container needs a measurable size
  mockGetBoundingClientRect({ width: 800, height: 600 });

  if (hasError) {
    setupMfaEnrolledUsersEndpointError();
  } else {
    setupMfaEnrolledUsersEndpoint(users);
  }
  setupMfaAdminRemoveEndpoint();

  renderWithProviders(<EnrolledUsersPage />, {
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({ id: CURRENT_USER_ID, is_superuser: true }),
    }),
  });
}

function lastListUrl() {
  return String(
    fetchMock.callHistory.calls("path:/api/ee/mfa/admin/enrolled-users").at(-1)
      ?.url,
  );
}

describe("EnrolledUsersPage", () => {
  it("lists enrolled users", async () => {
    setup();

    expect(await screen.findByText("Bobby Tables")).toBeInTheDocument();
    expect(screen.getByText("bobby@metabase.test")).toBeInTheDocument();
  });

  it("marks deactivated users, who are listed because their enrollment still exists", async () => {
    setup({
      users: [createMockMfaEnrolledUser({ ...OTHER_USER, is_active: false })],
    });

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });

  it("does not offer the action on your own row — the API refuses self-removal", async () => {
    setup({
      users: [
        createMockMfaEnrolledUser({
          id: CURRENT_USER_ID,
          first_name: "Me",
          last_name: "Myself",
          common_name: "Me Myself",
        }),
      ],
    });

    expect(await screen.findByText("Me Myself")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Actions for Me Myself"),
    ).not.toBeInTheDocument();
  });

  it("distinguishes nobody being enrolled from a search that matches nobody", async () => {
    setup({ users: [] });

    expect(await screen.findByText("No enrolled users")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search…"), "nobody");

    expect(await screen.findByText("No results found")).toBeInTheDocument();
    expect(screen.queryByText("No enrolled users")).not.toBeInTheDocument();
  });

  it("shows an error state instead of an empty table when the request fails", async () => {
    setup({ hasError: true });

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    // the table must not render at all — an empty one would read as "nobody is enrolled"
    expect(
      screen.queryByTestId("mfa-enrolled-users-table"),
    ).not.toBeInTheDocument();
  });

  it("searching resets to the first page, so a new query can't land on a stale offset", async () => {
    // more than one page, so the pagination controls render
    setup({
      users: Array.from({ length: 30 }, (_, index) =>
        createMockMfaEnrolledUser({
          id: index + 10,
          first_name: "Person",
          last_name: String(index),
          common_name: `Person ${index}`,
        }),
      ),
    });
    await screen.findByText("Person 0");

    await userEvent.click(screen.getByLabelText("Next page"));
    await waitFor(() => expect(lastListUrl()).toContain("offset=25"));

    await userEvent.type(screen.getByPlaceholderText("Search…"), "person");

    await waitFor(() => expect(lastListUrl()).toContain("query=person"));
    // no request may ever combine the new query with the old offset, not even transiently
    const searchUrls = fetchMock.callHistory
      .calls("path:/api/ee/mfa/admin/enrolled-users")
      .map((call) => String(call.url))
      .filter((url) => url.includes("query=person"));
    expect(searchUrls.length).toBeGreaterThan(0);
    searchUrls.forEach((url) => expect(url).toContain("offset=0"));
  });
});
