import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDashboardQuestionCandidatesEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { DashboardQuestionCandidate } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { MoveQuestionsIntoDashboardsModal } from "./MoveQuestionsIntoDashboardsModal";

const COLLECTION_ID = 1;
const MODAL_ROUTE = `/collection/${COLLECTION_ID}/move-questions-dashboard`;
const CANDIDATES_URL = `path:/api/collection/${COLLECTION_ID}/dashboard-question-candidates`;
const ACK_URL =
  "path:/api/user-key-value/namespace/user_acknowledgement/key/dashboard_question_migration_info_modal";
const MOVE_URL = `path:/api/collection/${COLLECTION_ID}/move-dashboard-question-candidates`;

const CANDIDATES: DashboardQuestionCandidate[] = [
  {
    id: 10,
    name: "Orders question",
    description: null,
    sole_dashboard_info: {
      id: 100,
      name: "Orders dashboard",
      description: null,
    },
  },
  {
    id: 20,
    name: "People question",
    description: null,
    sole_dashboard_info: {
      id: 200,
      name: "People dashboard",
      description: null,
    },
  },
];

type SetupOpts = {
  isAdmin: boolean;
  hasAckedInfoModal: boolean;
};

function setup({ isAdmin, hasAckedInfoModal }: SetupOpts) {
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "dashboard_question_migration_info_modal",
    value: hasAckedInfoModal,
  });
  setupDashboardQuestionCandidatesEndpoint(CANDIDATES);
  fetchMock.post(MOVE_URL, { moved: CANDIDATES.map(({ id }) => id) });

  const onClose = jest.fn<void, []>();

  const { router } = renderWithProviders(
    <>
      <Route path="start" element={<div>start page</div>} />
      <Route path="collection/:slug">
        <Route index element={<div>collection page</div>} />
        <Route
          path="move-questions-dashboard"
          element={
            <MoveQuestionsIntoDashboardsModal
              params={{ slug: String(COLLECTION_ID) }}
              onClose={onClose}
            />
          }
        />
      </Route>
    </>,
    {
      withRouter: true,
      initialRoute: "/start",
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );

  act(() => router?.navigate(MODAL_ROUTE));

  return { router, onClose };
}

describe("MoveQuestionsIntoDashboardsModal", () => {
  it("redirects a non-admin to the collection page without fetching candidates", async () => {
    const { router } = setup({ isAdmin: false, hasAckedInfoModal: true });

    expect(await screen.findByText("collection page")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(`/collection/${COLLECTION_ID}`);
    expect(
      screen.queryByTestId("move-questions-into-dashboard-modal"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("move-questions-into-dashboard-info-modal"),
    ).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls(CANDIDATES_URL)).toHaveLength(0);

    // the redirect replaces the modal route, so going back skips it
    act(() => router?.back());
    expect(await screen.findByText("start page")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/start");
  });

  it("shows the info modal first and the candidates after the admin acknowledges it", async () => {
    setup({
      isAdmin: true,
      hasAckedInfoModal: false,
    });

    const infoModal = await screen.findByTestId(
      "move-questions-into-dashboard-info-modal",
    );
    expect(
      screen.getByText("Move questions into their dashboards?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("move-questions-into-dashboard-modal"),
    ).not.toBeInTheDocument();
    expect(infoModal).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Preview the changes" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(ACK_URL, { method: "PUT" }),
      ).toHaveLength(1),
    );
    const putBody: unknown = fetchMock.callHistory.lastCall(ACK_URL, {
      method: "PUT",
    })?.options.body;
    expect(JSON.parse(String(putBody))).toEqual({ value: true });

    const modal = await screen.findByTestId(
      "move-questions-into-dashboard-modal",
    );
    expect(
      screen.queryByTestId("move-questions-into-dashboard-info-modal"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Orders question")).toBeInTheDocument();
    expect(screen.getByText("Orders dashboard")).toBeInTheDocument();
    expect(screen.getByText("People question")).toBeInTheDocument();
    expect(screen.getByText("People dashboard")).toBeInTheDocument();
    expect(modal).toBeInTheDocument();
  });

  it("shows the candidates directly when the admin already acknowledged the info modal", async () => {
    setup({ isAdmin: true, hasAckedInfoModal: true });

    expect(
      await screen.findByTestId("move-questions-into-dashboard-modal"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Orders question")).toBeInTheDocument();
    expect(screen.getByText("Orders dashboard")).toBeInTheDocument();
    expect(
      screen.queryByTestId("move-questions-into-dashboard-info-modal"),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(ACK_URL, { method: "PUT" }),
    ).toHaveLength(0);
  });

  it("moves the candidate questions and closes when confirming", async () => {
    const { onClose } = setup({ isAdmin: true, hasAckedInfoModal: true });

    expect(await screen.findByText("Orders question")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Move these questions" }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(fetchMock.callHistory.calls(MOVE_URL)).toHaveLength(1);
    const moveBody: unknown =
      fetchMock.callHistory.lastCall(MOVE_URL)?.options.body;
    expect(JSON.parse(String(moveBody))).toEqual({ card_ids: [10, 20] });
  });
});
