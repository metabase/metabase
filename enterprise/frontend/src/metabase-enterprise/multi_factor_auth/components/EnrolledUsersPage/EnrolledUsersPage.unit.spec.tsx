import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupMfaAdminRemoveEndpoint,
  setupMfaEnrolledUsersEndpoint,
  setupMfaEnrolledUsersEndpointError,
  setupStatefulMfaEnrolledUsersEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { MfaEnrolledUser } from "metabase-types/api";
import {
  createMockMfaEnrolledUser,
  createMockUser,
} from "metabase-types/api/mocks";

import { EnrolledUsersPage } from "./EnrolledUsersPage";

// The search debounce is idle time in these tests: they assert what a search
// returns, not that the input waits before it asks.
jest.mock("metabase/utils/constants", () => ({
  ...jest.requireActual("metabase/utils/constants"),
  SEARCH_DEBOUNCE_DURATION: 0,
}));

const CURRENT_USER_ID = 1;

const OTHER_USER = createMockMfaEnrolledUser({
  id: 2,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
  email: "bobby@metabase.test",
});

const SECOND_USER = createMockMfaEnrolledUser({
  id: 3,
  first_name: "Robert",
  last_name: "Normal",
  common_name: "Robert Normal",
  email: "normal@metabase.test",
});

type SetupOpts = {
  users?: MfaEnrolledUser[];
  hasError?: boolean;
  isStateful?: boolean;
};

function setup({
  users = [OTHER_USER],
  hasError = false,
  isStateful = false,
}: SetupOpts = {}) {
  // TreeTable virtualizes rows, so the container needs a measurable size
  mockGetBoundingClientRect({ width: 800, height: 600 });

  if (hasError) {
    setupMfaEnrolledUsersEndpointError();
    setupMfaAdminRemoveEndpoint();
  } else if (isStateful) {
    setupStatefulMfaEnrolledUsersEndpoints(users);
  } else {
    setupMfaEnrolledUsersEndpoint(users);
    setupMfaAdminRemoveEndpoint();
  }

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

  it("removes a user's enrollment from their row and drops them from the list", async () => {
    setup({ users: [OTHER_USER, SECOND_USER], isStateful: true });

    const table = await screen.findByTestId("mfa-enrolled-users-table");
    expect(await within(table).findByText("Robert Normal")).toBeInTheDocument();
    expect(within(table).getByText("normal@metabase.test")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Actions for Robert Normal"));
    await userEvent.click(
      await screen.findByText("Remove two-factor authentication"),
    );

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(
        "Remove two-factor authentication for Robert Normal?",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Remove" }),
    );

    await waitFor(() => {
      expect(
        within(screen.getByTestId("mfa-enrolled-users-table")).queryByText(
          "normal@metabase.test",
        ),
      ).not.toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("mfa-enrolled-users-table")).getByText(
        "bobby@metabase.test",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const removals = fetchMock.callHistory.calls(
      "path:/api/ee/mfa/admin/remove",
    );
    expect(removals).toHaveLength(1);
    const body: unknown = JSON.parse(String(removals[0].options.body));
    expect(body).toEqual({ user_id: SECOND_USER.id });
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
