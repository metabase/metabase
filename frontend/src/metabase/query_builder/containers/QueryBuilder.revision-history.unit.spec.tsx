import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupRevertableRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { act, screen, waitFor, within } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import { createMockRevision } from "metabase-types/api/mocks/revision";

import { TEST_STRUCTURED_CARD, setup } from "./test-utils";

registerVisualizations();

const CREATION_REVISION = createMockRevision({
  id: 1,
  description: "created this",
  is_creation: true,
});
const DESCRIPTION_REVISION = createMockRevision({
  id: 2,
  description: "added a description",
  is_creation: false,
  timestamp: "2023-05-17T13:33:30.198622-07:00",
});
const RENAME_REVISION = createMockRevision({
  id: 3,
  description: 'renamed this Card from "Orders" to "Orders renamed"',
  is_creation: false,
  timestamp: "2023-05-18T13:33:30.198622-07:00",
});
const REVERT_REVISION = createMockRevision({
  id: 4,
  description: "reverted to an earlier version.",
  is_creation: false,
  is_reversion: true,
  timestamp: "2023-05-19T13:33:30.198622-07:00",
});

interface SetupOpts {
  canWrite: boolean;
}

async function setupRevisionHistory({ canWrite }: SetupOpts) {
  const card = createMockCard({
    ...TEST_STRUCTURED_CARD,
    name: "Orders renamed",
    can_write: canWrite,
    "last-edit-info": {
      id: 1,
      email: "admin@metabase.test",
      first_name: "Admin",
      last_name: "Test",
      timestamp: "2023-05-18T13:33:30.198622-07:00",
    },
  });
  let currentCard: Card = card;

  // Registered before `setup` so this route wins over its static card mock.
  fetchMock.get(`path:/api/card/${card.id}`, () => currentCard);
  setupRevertableRevisionsEndpoints({
    entity: "card",
    id: card.id,
    revisions: [RENAME_REVISION, DESCRIPTION_REVISION, CREATION_REVISION],
    revertRevision: REVERT_REVISION,
    onRevert: () => {
      currentCard = { ...card, name: "Orders" };
    },
  });
  setupUsersEndpoints([createMockUserListResult()]);
  setupListNotificationEndpoints({ card_id: card.id }, []);

  await setup({ card });

  return { card };
}

const getHeaderTitle = () => screen.getByTestId("saved-question-header-title");

const findHistory = () => screen.findByTestId("saved-question-history-list");

describe("QueryBuilder > revision history", () => {
  it("opens the history from the last-edit button and the info button, and reverts to the selected version", async () => {
    const { card } = await setupRevisionHistory({ canWrite: true });
    expect(getHeaderTitle()).toHaveValue("Orders renamed");

    await userEvent.click(screen.getByTestId("revision-history-button"));
    let history = await findHistory();
    expect(
      await within(history).findAllByTestId("revision-history-event"),
    ).toHaveLength(3);
    expect(
      within(history).getAllByTestId("question-revert-button"),
    ).toHaveLength(2);

    await userEvent.click(
      within(screen.getByTestId("sidesheet")).getByRole("button", {
        name: "Close",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument(),
    );
    // The sheet hides itself before it tells the query builder, so check that
    // it stays closed and is not shown again by the query builder state.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("qb-header-info-button"));
    history = await findHistory();
    await userEvent.click(
      await within(history).findByRole("button", {
        name: "revert to You created this",
      }),
    );

    await waitFor(() => expect(getHeaderTitle()).toHaveValue("Orders"));
    const revertCalls = fetchMock.callHistory.calls(
      "path:/api/revision/revert",
      { method: "POST" },
    );
    expect(revertCalls).toHaveLength(1);
    const body: unknown = JSON.parse(String(revertCalls[0].options.body));
    expect(body).toEqual({
      entity: "card",
      id: card.id,
      revision_id: CREATION_REVISION.id,
    });
  });

  it("does not show revert buttons to a user who cannot write to the question (metabase#13229)", async () => {
    await setupRevisionHistory({ canWrite: false });

    await userEvent.click(screen.getByTestId("qb-header-info-button"));
    const history = await findHistory();

    expect(
      await within(history).findAllByTestId("revision-history-event"),
    ).toHaveLength(3);
    expect(
      within(history).getByText("You added a description"),
    ).toBeInTheDocument();
    expect(
      within(history).queryByTestId("question-revert-button"),
    ).not.toBeInTheDocument();
  });
});
