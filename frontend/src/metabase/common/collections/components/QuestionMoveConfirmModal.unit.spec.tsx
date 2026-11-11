import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { CardId, DashboardId } from "metabase-types/api";

import {
  type Destination,
  QuestionMoveConfirmModal,
} from "./QuestionMoveConfirmModal";

const CARD_ID = 1;
const CARD_NAME = "Blue Question";

type CardDashboardsResponse = {
  card_id: CardId;
  dashboards: { id: DashboardId; name: string; error?: string }[];
}[];

const BLUE_DASHBOARD = { id: 1, name: "Blue Dashboard" };
const PURPLE_DASHBOARD = { id: 2, name: "Purple Dashboard" };
const ORANGE_DASHBOARD = { id: 3, name: "Orange Dashboard" };

type SetupOpts = {
  cardDashboards: CardDashboardsResponse;
  destination?: Destination;
  errorMessage?: string;
};

const setup = ({
  cardDashboards,
  destination = { id: ORANGE_DASHBOARD.id, model: "dashboard" },
  errorMessage,
}: SetupOpts) => {
  fetchMock.post("path:/api/cards/dashboards", cardDashboards);

  const onConfirm = jest.fn<void, []>();
  const onClose = jest.fn<void, []>();

  renderWithProviders(
    <QuestionMoveConfirmModal
      selectedItems={[{ id: CARD_ID, model: "card", name: CARD_NAME }]}
      destination={destination}
      onConfirm={onConfirm}
      onClose={onClose}
      errorMessage={errorMessage}
    />,
  );

  return { onConfirm, onClose };
};

describe("QuestionMoveConfirmModal", () => {
  it("lists the other dashboards the question will be removed from and confirms the move", async () => {
    const { onConfirm, onClose } = setup({
      cardDashboards: [
        { card_id: CARD_ID, dashboards: [BLUE_DASHBOARD, PURPLE_DASHBOARD] },
      ],
    });

    expect(await screen.findByText("Move this question?")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "Blue Question will be removed from Blue Dashboard and Purple Dashboard",
    );
    expect(
      screen.queryByText(
        "This question currently appears in a dashboard that you don't have permission to edit.",
      ),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Move it" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not list the destination dashboard among the dashboards the question will be removed from", async () => {
    setup({
      cardDashboards: [
        {
          card_id: CARD_ID,
          dashboards: [BLUE_DASHBOARD, PURPLE_DASHBOARD, ORANGE_DASHBOARD],
        },
      ],
      destination: { id: ORANGE_DASHBOARD.id, model: "dashboard" },
    });

    const listItem = await screen.findByRole("listitem");
    expect(listItem).toHaveTextContent(
      "Blue Question will be removed from Blue Dashboard and Purple Dashboard",
    );
    expect(listItem).not.toHaveTextContent(ORANGE_DASHBOARD.name);
  });

  it("shows the error message in the modal footer", async () => {
    setup({
      cardDashboards: [
        { card_id: CARD_ID, dashboards: [BLUE_DASHBOARD, PURPLE_DASHBOARD] },
      ],
      errorMessage: "Ryan said no",
    });

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Ryan said no")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Move it" }),
    ).toBeInTheDocument();
  });

  it.each(["unwritable-dashboard", "unreadable-dashboard"])(
    "explains that the question can't be moved when one of its dashboards has an %s error",
    async (error) => {
      const { onConfirm, onClose } = setup({
        cardDashboards: [
          {
            card_id: CARD_ID,
            dashboards: [BLUE_DASHBOARD, { ...PURPLE_DASHBOARD, error }],
          },
        ],
      });

      expect(
        await screen.findByText("Can't move this question into a dashboard"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "This question currently appears in a dashboard that you don't have permission to edit.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Move this question?")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Move it" }),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Okay" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    },
  );

  it("confirms automatically without showing anything when the destination is the only dashboard the question appears in", async () => {
    const { onConfirm, onClose } = setup({
      cardDashboards: [{ card_id: CARD_ID, dashboards: [ORANGE_DASHBOARD] }],
      destination: { id: ORANGE_DASHBOARD.id, model: "dashboard" },
    });

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

    expect(screen.queryByText("Move this question?")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Checking on some things..."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
