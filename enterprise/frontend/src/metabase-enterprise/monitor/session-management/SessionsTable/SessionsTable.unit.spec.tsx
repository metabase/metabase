import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { Session } from "metabase-types/api";
import { createMockSession } from "metabase-types/api/mocks";

import { SessionsTable } from "./SessionsTable";

type SetupOpts = {
  sessions: Session[];
  isEndedTab?: boolean;
};

const setup = ({ sessions, isEndedTab = false }: SetupOpts) => {
  mockGetBoundingClientRect({ height: 800, width: 1000 });

  renderWithProviders(
    <SessionsTable
      sessions={sessions}
      error={undefined}
      isFetching={false}
      isEndedTab={isEndedTab}
      page={0}
      rowSelection={{}}
      selectedSessionId={undefined}
      sorting={[{ id: "created_at", desc: true }]}
      emptyLabel="No sessions"
      onSortingChange={jest.fn()}
      onRowSelectionChange={jest.fn()}
      onRowClick={jest.fn()}
    />,
  );
};

const getRow = (session: Session) =>
  screen.findByTestId(`session-row-${session.id}`);

const getColumnHeaders = () =>
  screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent)
    .filter(Boolean);

describe("SessionsTable", () => {
  it("shows the active tab's columns", async () => {
    setup({ sessions: [createMockSession()] });
    await getRow(createMockSession());

    expect(getColumnHeaders()).toEqual([
      "User",
      "Device",
      "Auth method",
      "Signed in",
    ]);
  });

  it("shows when and why each session ended on the ended tab", async () => {
    const revoked = createMockSession({
      id: "revoked",
      status: "ended",
      ended_at: "2026-09-16T12:00:00Z",
      end_reason: "admin",
    });
    const unrecorded = createMockSession({ id: "unrecorded", status: "ended" });
    setup({ sessions: [revoked, unrecorded], isEndedTab: true });

    expect(await getRow(revoked)).toHaveTextContent("Revoked by admin");
    expect(getColumnHeaders()).toEqual([
      "User",
      "Device",
      "Signed in",
      "Ended",
      "Reason",
    ]);
    expect(
      within(await getRow(unrecorded)).getAllByText(EMPTY_CELL_PLACEHOLDER),
    ).toHaveLength(2);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("badges the session this browser is using, and doesn't let it be selected", async () => {
    const current = createMockSession({ id: "current", current: true });
    const other = createMockSession({ id: "other" });
    setup({ sessions: [current, other] });

    expect(
      within(await getRow(current)).getByText("This session"),
    ).toBeInTheDocument();
    expect(within(await getRow(current)).getByRole("checkbox")).toBeDisabled();
    expect(
      within(await getRow(other)).queryByText("This session"),
    ).not.toBeInTheDocument();
    expect(within(await getRow(other)).getByRole("checkbox")).toBeEnabled();
  });

  it("badges full-app embedding sessions", async () => {
    const embedded = createMockSession({
      id: "embedded",
      type: "full-app-embed",
    });
    const normal = createMockSession({ id: "normal", type: "normal" });
    setup({ sessions: [embedded, normal] });

    expect(
      within(await getRow(embedded)).getByText("Embedded"),
    ).toBeInTheDocument();
    expect(
      within(await getRow(normal)).queryByText("Embedded"),
    ).not.toBeInTheDocument();
  });
});
