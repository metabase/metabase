import dayjs from "dayjs";
import fetchMock from "fetch-mock";

import {
  setupRevokeAccessGrantEndpoint,
  setupRevokeAccessGrantEndpointWithError,
} from "__support__/server-mocks";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SupportAccessGrant } from "metabase-types/api";
import { createMockAccessGrant } from "metabase-types/api/mocks";

import { AccessGrantList } from "./AccessGrantList";

const setup = (accessGrants: SupportAccessGrant[]) => {
  renderWithProviders(
    <>
      <AccessGrantList accessGrants={accessGrants} />
      <UndoListing />
    </>,
  );
};

describe("AccessGrantList", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.spyOn(console, "error").mockRestore();
    fetchMock.clearHistory();
  });

  const testActiveGrant = createMockAccessGrant({
    id: 1,
    ticket_number: "TICKET-1234",
    notes: "This is a test note",
    grant_start_timestamp: dayjs().subtract(1, "hour").toISOString(),
    grant_end_timestamp: dayjs().add(23, "hours").toISOString(),
    revoked_at: null,
    user_name: "John Doe",
    user_email: "john.doe@example.com",
  });

  const testRevokedGrant = createMockAccessGrant({
    id: 2,
    ticket_number: null,
    notes: null,
    grant_start_timestamp: dayjs().subtract(3, "days").toISOString(),
    grant_end_timestamp: dayjs().add(1, "day").toISOString(),
    revoked_at: dayjs().subtract(2, "days").toISOString(),
    user_name: "Jane Smith",
    user_email: "john.doe@example.com",
  });

  it("should render a list of access grants", () => {
    setup([testActiveGrant, testRevokedGrant]);

    const table = screen.getByTestId("access-grant-list-table");
    expect(table).toBeInTheDocument();

    expect(within(table).getByText("TICKET-1234")).toBeInTheDocument();
    expect(within(table).getByText("This is a test note")).toBeInTheDocument();
    expect(within(table).getByText("John Doe")).toBeInTheDocument();

    const cells = within(table).getAllByText("-");
    expect(cells.length).toBeGreaterThanOrEqual(2);
    expect(within(table).getByText("Jane Smith")).toBeInTheDocument();

    const revokeButtons = screen.getAllByLabelText("Revoke access grant");
    expect(revokeButtons).toHaveLength(1);

    expect(within(table).getByText(/23 hours left/)).toBeInTheDocument();
  });

  it("should use email and user id as fallback if name is not set", () => {
    setup([
      { ...testActiveGrant, user_id: 1001, user_name: null },
      { ...testActiveGrant, user_id: 1002, user_name: null, user_email: null },
    ]);

    const table = screen.getByTestId("access-grant-list-table");
    expect(table).toBeInTheDocument();

    expect(within(table).getAllByText("john.doe@example.com")).toHaveLength(1);
    expect(within(table).queryByText("1001")).not.toBeInTheDocument();
    expect(within(table).getAllByText("1002")).toHaveLength(1);
  });

  describe("revoking", () => {
    const executeAccessRevokeFlow = async (grantId: number) => {
      const revokeButton = screen.getByLabelText("Revoke access grant");
      fireEvent.click(revokeButton);

      await waitFor(() => {
        expect(screen.getByText("Revoke access grant?")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: "Revoke" });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(
            `path:/api/ee/support-access-grant/${grantId}/revoke`,
          ),
        ).toHaveLength(1);
      });
    };

    it("can revoke an active grant access", async () => {
      const activeGrant = createMockAccessGrant({
        id: 1,
        grant_start_timestamp: dayjs().subtract(1, "hour").toISOString(),
        grant_end_timestamp: dayjs().add(23, "hours").toISOString(),
        revoked_at: null,
      });

      const revokedGrant = createMockAccessGrant({
        ...activeGrant,
        revoked_at: dayjs().toISOString(),
      });

      setupRevokeAccessGrantEndpoint(activeGrant.id, revokedGrant);
      setup([activeGrant]);

      await executeAccessRevokeFlow(activeGrant.id);

      await waitFor(() => {
        const toast = screen.getByTestId("toast-undo");
        expect(
          within(toast).getByText(/Access grant revoked successfully/),
        ).toBeInTheDocument();
      });
    });

    it("should display error toast when revoking fails", async () => {
      const activeGrant = createMockAccessGrant({
        id: 1,
        grant_start_timestamp: dayjs().subtract(1, "hour").toISOString(),
        grant_end_timestamp: dayjs().add(23, "hours").toISOString(),
        revoked_at: null,
      });

      setupRevokeAccessGrantEndpointWithError(activeGrant.id);

      setup([activeGrant]);

      await executeAccessRevokeFlow(activeGrant.id);

      await waitFor(() => {
        const toast = screen.getByTestId("toast-undo");
        expect(
          within(toast).getByText(
            /Sorry, something went wrong. Please try again/,
          ),
        ).toBeInTheDocument();
      });
    });
  });
});
