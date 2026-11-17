import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupSubscriptionEndpoint,
  setupUnsubscribeFromSubscriptionEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { DashboardSubscription } from "metabase-types/api";
import { createMockDashboardSubscription } from "metabase-types/api/mocks/pulse";
import { createMockUser } from "metabase-types/api/mocks/user";

import { UnsubscribePulseModal } from "./UnsubscribePulseModal";

const CURRENT_USER = createMockUser({ id: 1 });
const OTHER_USER = createMockUser({ id: 2 });

type SetupOpts = {
  pulse?: DashboardSubscription;
  unsubscribeResponse?: object;
};

const setup = ({
  pulse = createMockDashboardSubscription({ creator_id: OTHER_USER.id }),
  unsubscribeResponse,
}: SetupOpts = {}) => {
  setupSubscriptionEndpoint(pulse);
  setupUnsubscribeFromSubscriptionEndpoint(pulse, unsubscribeResponse);
  const onClose = jest.fn();

  const { router } = renderWithProviders(
    <UnsubscribePulseModal
      params={{ pulseId: String(pulse.id) }}
      onClose={onClose}
    />,
    {
      withRouter: true,
      storeInitialState: createMockState({ currentUser: CURRENT_USER }),
    },
  );

  return { pulse, onClose, router };
};

const isUnsubscribeCalled = (pulse: DashboardSubscription) =>
  fetchMock.callHistory.called(`path:/api/pulse/${pulse.id}/subscription`, {
    method: "DELETE",
  });

describe("UnsubscribePulseModal", () => {
  it("should describe the subscription", async () => {
    setup();

    expect(
      await screen.findByText("You'll stop receiving this subscription", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("should unsubscribe and close", async () => {
    const { pulse, onClose, router } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Unsubscribe" }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(isUnsubscribeCalled(pulse)).toBe(true);
    expect(router?.location.pathname).toBe("/");
  });

  it("should offer the creator to delete it after unsubscribing", async () => {
    const { pulse, onClose, router } = setup({
      pulse: createMockDashboardSubscription({ creator_id: CURRENT_USER.id }),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Unsubscribe" }),
    );

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        `/account/notifications/pulse/${pulse.id}/archive`,
      ),
    );
    expect(router?.location.search).toBe("?unsubscribed=true");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should show the error and stay open when unsubscribing fails", async () => {
    const { pulse, onClose, router } = setup({
      unsubscribeResponse: {
        status: 500,
        body: { message: "An error occurred" },
      },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Unsubscribe" }),
    );

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(isUnsubscribeCalled(pulse)).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(router?.location.pathname).toBe("/");
  });
});
