import userEvent from "@testing-library/user-event";
import type { UserRouteConfig } from "fetch-mock";

import { setupAuditUnsubscribeEndpoint } from "__support__/server-mocks/audit";
import { setupUserEndpoints } from "__support__/server-mocks/user";
import { findRequests } from "__support__/server-mocks/util";
import {
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui-with-store";
import { createMockUser } from "metabase-types/api/mocks";

import { UnsubscribeUserModal } from "./UnsubscribeUserModal";

function setup({
  unsubscribeResponse = undefined,
}: { unsubscribeResponse?: UserRouteConfig } = {}) {
  const user = createMockUser({ id: 1, common_name: "John Doe" });

  setupUserEndpoints(user);
  setupAuditUnsubscribeEndpoint(user.id, unsubscribeResponse);

  const onClose = jest.fn();

  renderWithProviders(
    <UnsubscribeUserModal
      params={{ userId: `${user.id}` }}
      onClose={onClose}
    />,
  );

  return { user, onClose };
}

describe("UnsubscribeUserModal", () => {
  it("should close on successful submit", async () => {
    const { user, onClose } = setup();

    await screen.findByText(
      `Unsubscribe ${user.common_name} from all subscriptions and alerts?`,
    );

    await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));

    await waitFor(async () => {
      const deletes = await findRequests("DELETE");
      expect(deletes).toHaveLength(1);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("should display a message on submit failure", async () => {
    const error = { message: "error" };
    const unsubscribeResponse = { status: 404, body: error };
    const { user, onClose } = setup({ unsubscribeResponse });

    await screen.findByText(
      `Unsubscribe ${user.common_name} from all subscriptions and alerts?`,
    );

    await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));

    await waitFor(async () => {
      const deletes = await findRequests("DELETE");
      expect(deletes).toHaveLength(1);
    });

    expect(await screen.findByText(error.message)).toBeInTheDocument();

    expect(onClose).not.toHaveBeenCalled();
  });
});
