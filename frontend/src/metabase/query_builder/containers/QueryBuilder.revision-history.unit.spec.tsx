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
  createMockUser,
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

const findHistory = async () => {
  await userEvent.click(await screen.findByRole("tab", { name: "History" }));
  return screen.findByTestId("saved-question-history-list");
};

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

describe("QueryBuilder > last edit info", () => {
  const CURRENT_USER = createMockUser({
    id: 7,
    first_name: "Testy",
    last_name: "McTestface",
    email: "testy@metabase.test",
  });
  const OTHER_EDITOR = createMockUser({
    id: 8,
    first_name: "Robert",
    last_name: "Tableton",
    email: "robert@metabase.test",
  });

  // Mirrors the backend: the last editor and edit time change only when the
  // PUT for this card renames it.
  async function setupLastEditInfo() {
    const card = createMockCard({
      ...TEST_STRUCTURED_CARD,
      name: "Orders",
      can_write: true,
      "last-edit-info": {
        id: OTHER_EDITOR.id,
        email: OTHER_EDITOR.email,
        first_name: OTHER_EDITOR.first_name,
        last_name: OTHER_EDITOR.last_name,
        timestamp: "2023-05-18T13:33:30.198622-07:00",
      },
    });
    let currentCard: Card = card;

    // Registered before `setup` so these routes win over its static card mocks.
    fetchMock.get(`path:/api/card/${card.id}`, () => currentCard);
    fetchMock.put(`path:/api/card/${card.id}`, (call) => {
      const body: unknown = JSON.parse(String(call.options.body));
      if (
        typeof body !== "object" ||
        body === null ||
        !("name" in body) ||
        typeof body.name !== "string"
      ) {
        return { status: 400, body: {} };
      }
      currentCard = {
        ...currentCard,
        name: body.name,
        "last-edit-info": {
          id: CURRENT_USER.id,
          email: CURRENT_USER.email,
          first_name: CURRENT_USER.first_name,
          last_name: CURRENT_USER.last_name,
          timestamp: new Date().toISOString(),
        },
      };
      return currentCard;
    });
    setupListNotificationEndpoints({ card_id: card.id }, []);

    await setup({ card, currentUser: CURRENT_USER });

    return { card };
  }

  it("shows the last editor's name, and the edit moment and 'you' after the current user renames the question", async () => {
    const { card } = await setupLastEditInfo();

    expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
      /^Edited \d+ years ago by Robert Tableton$/,
    );

    await userEvent.type(getHeaderTitle(), "!");
    await userEvent.tab();

    await waitFor(() =>
      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        "Edited a few seconds ago by you",
      ),
    );
    expect(getHeaderTitle()).toHaveValue("Orders!");
    const putCalls = fetchMock.callHistory.calls(`path:/api/card/${card.id}`, {
      method: "PUT",
    });
    expect(putCalls).toHaveLength(1);
    const body: unknown = JSON.parse(String(putCalls[0].options.body));
    expect(body).toMatchObject({ name: "Orders!" });
  });
});
