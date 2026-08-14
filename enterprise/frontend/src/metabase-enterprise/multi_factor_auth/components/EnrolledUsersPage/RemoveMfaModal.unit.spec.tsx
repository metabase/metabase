import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupMfaAdminRemoveEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockMfaEnrolledUser } from "metabase-types/api/mocks";

import { RemoveMfaModal } from "./RemoveMfaModal";

const USER = createMockMfaEnrolledUser({
  id: 2,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
});

type SetupOpts = {
  error?: { status: number; body?: unknown };
};

function setup({ error }: SetupOpts = {}) {
  if (error) {
    fetchMock.post("path:/api/ee/mfa/admin/remove", {
      status: error.status,
      body: error.body,
    });
  } else {
    setupMfaAdminRemoveEndpoint();
  }

  const onClose = jest.fn();
  renderWithProviders(<RemoveMfaModal user={USER} onClose={onClose} />);
  return { onClose };
}

async function confirm() {
  await userEvent.click(screen.getByRole("button", { name: "Remove" }));
}

describe("RemoveMfaModal", () => {
  it("removes the enrollment and closes on success", async () => {
    const { onClose } = setup();

    await confirm();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/mfa/admin/remove"),
      ).toHaveLength(1);
    });
    const [call] = fetchMock.callHistory.calls("path:/api/ee/mfa/admin/remove");
    expect(JSON.parse(String(call.options?.body))).toEqual({ user_id: 2 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("surfaces the server's message and stays open when removal fails", async () => {
    const { onClose } = setup({
      error: {
        status: 400,
        body: {
          message:
            "You cannot administratively remove your own two-factor authentication.",
        },
      },
    });

    await confirm();

    expect(
      await screen.findByText(
        "You cannot administratively remove your own two-factor authentication.",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
  });

  it("clears a previous error when the retry succeeds", async () => {
    const { onClose } = setup({ error: { status: 500 } });

    await confirm();
    await screen.findByText(/couldn't remove two-factor authentication/i);

    fetchMock.removeRoutes();
    setupMfaAdminRemoveEndpoint();
    await confirm();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
