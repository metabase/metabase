import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupEntityRevisionsEndpoint,
  setupRevertRevisionEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { ModerationReview, Revision } from "metabase-types/api";
import {
  createMockModerationReview,
  createMockRevision,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ActivityTimelineCard } from "./ActivityTimelineCard";

const DASHBOARD_ID = 10;

const CREATED = createMockRevision({
  id: 1,
  description: "created this",
  timestamp: "2026-05-14T10:00:00Z",
  user: { id: 1, first_name: "Me", last_name: "Myself", common_name: "Me" },
});

const RENAMED = createMockRevision({
  id: 2,
  description: "renamed it",
  timestamp: "2026-05-16T10:00:00Z",
  is_creation: false,
  user: {
    id: 2,
    first_name: "Bobby",
    last_name: "Tables",
    common_name: "Bobby Tables",
  },
});

const VERIFIED = createMockModerationReview({
  created_at: "2026-05-15T10:00:00Z",
  user: createMockUser({ id: 2, common_name: "Bobby Tables" }),
});

type SetupOpts = {
  revisions?: Revision[];
  moderationReviews?: ModerationReview[];
  canWrite?: boolean;
};

function setup({
  revisions = [RENAMED, CREATED],
  moderationReviews = [],
  canWrite = true,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ content_verification: true }),
  });
  setupEnterpriseOnlyPlugin("moderation");
  setupEntityRevisionsEndpoint("dashboard", DASHBOARD_ID, revisions);
  setupRevertRevisionEndpoint(CREATED);

  renderWithProviders(
    <ActivityTimelineCard
      entity="dashboard"
      id={DASHBOARD_ID}
      moderationReviews={moderationReviews}
      canWrite={canWrite}
      data-testid="history-list"
    />,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({ id: 1 }),
      }),
    },
  );
}

async function findEvents() {
  await screen.findByTestId("history-list");
  return screen.getAllByTestId("revision-history-event");
}

describe("ActivityTimelineCard", () => {
  it("lists revisions and moderation events newest first", async () => {
    setup({ moderationReviews: [VERIFIED] });

    const events = await findEvents();
    expect(events).toHaveLength(3);
    expect(events[0]).toHaveTextContent("Bobby Tables renamed it");
    expect(events[1]).toHaveTextContent("verified this");
    expect(events[2]).toHaveTextContent("You created this");
  });

  it("reverts to an older revision of the entity", async () => {
    setup();

    await findEvents();
    await userEvent.click(screen.getByTestId("question-revert-button"));

    await waitFor(() =>
      expect(fetchMock.callHistory.called("path:/api/revision/revert")).toBe(
        true,
      ),
    );
    const call = fetchMock.callHistory.lastCall("path:/api/revision/revert");
    expect(await call?.request?.json()).toEqual({
      entity: "dashboard",
      id: DASHBOARD_ID,
      revision_id: CREATED.id,
    });
  });

  it("offers no revert to a user who cannot write", async () => {
    setup({ canWrite: false });

    expect(await findEvents()).toHaveLength(2);
    expect(
      screen.queryByTestId("question-revert-button"),
    ).not.toBeInTheDocument();
  });

  it("says when there is no history", async () => {
    setup({ revisions: [] });

    expect(
      await screen.findByText("No revision history available."),
    ).toBeInTheDocument();
  });
});
