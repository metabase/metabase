import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupSubscriptionEndpoint,
  setupUpdateSubscriptionEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { DashboardSubscription, User } from "metabase-types/api";
import { createMockChannel } from "metabase-types/api/mocks/alert";
import { createMockDashboardSubscription } from "metabase-types/api/mocks/pulse";
import { createMockUser } from "metabase-types/api/mocks/user";

import { ArchivePulseModal } from "./ArchivePulseModal";

const CURRENT_USER = createMockUser({ id: 1, email: "me@example.com" });
const OTHER_USER = createMockUser({ id: 2 });

type SetupOpts = {
  pulse?: DashboardSubscription;
  user?: User;
  hasUnsubscribed?: boolean;
  updateResponse?: object;
};

const setup = ({
  pulse = createMockDashboardSubscription({ creator_id: OTHER_USER.id }),
  user = CURRENT_USER,
  hasUnsubscribed = false,
  updateResponse,
}: SetupOpts = {}) => {
  setupSubscriptionEndpoint(pulse);
  setupUpdateSubscriptionEndpoint(pulse, updateResponse);
  const onClose = jest.fn();

  renderWithProviders(
    <ArchivePulseModal
      params={{ pulseId: String(pulse.id) }}
      onClose={onClose}
    />,
    {
      withRouter: true,
      initialRoute: hasUnsubscribed ? "/?unsubscribed=true" : "/",
      storeInitialState: createMockState({ currentUser: user }),
    },
  );

  return { pulse, onClose };
};

describe("ArchivePulseModal", () => {
  it("should describe the subscription", async () => {
    setup({
      pulse: createMockDashboardSubscription({
        created_at: "2021-05-08T02:02:07.441Z",
        channels: [
          createMockChannel({
            channel_type: "email",
            recipients: [createMockUser(), createMockUser({ id: 3 })],
          }),
          createMockChannel({
            channel_type: "slack",
            recipients: [createMockUser()],
          }),
        ],
      }),
    });

    expect(
      await screen.findByText("You created this subscription on May 8, 2021", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 emails and 1 Slack channel", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("Delete this subscription?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Yes, delete this subscription" }),
    ).toBeInTheDocument();
  });

  it("should offer the creator to delete it after unsubscribing", async () => {
    setup({
      pulse: createMockDashboardSubscription({ creator_id: CURRENT_USER.id }),
      hasUnsubscribed: true,
    });

    expect(
      await screen.findByText(
        "You won't receive this subscription at me@example.com any more.",
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You're unsubscribed. Delete this subscription as well?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keep it around" }),
    ).toBeInTheDocument();
  });

  it("should archive the subscription and close", async () => {
    const { pulse, onClose } = setup();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Yes, delete this subscription",
      }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await getArchiveRequestBody(pulse)).toEqual({ archived: true });
  });

  it("should show the error and stay open when archiving fails", async () => {
    const { pulse, onClose } = setup({
      updateResponse: { status: 500, body: { message: "An error occurred" } },
    });

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Yes, delete this subscription",
      }),
    );

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(await getArchiveRequestBody(pulse)).toEqual({ archived: true });
    expect(onClose).not.toHaveBeenCalled();
  });
});

async function getArchiveRequestBody(
  pulse: DashboardSubscription,
): Promise<unknown> {
  const call = fetchMock.callHistory.lastCall(`path:/api/pulse/${pulse.id}`, {
    method: "PUT",
  });
  return call?.request?.json();
}
