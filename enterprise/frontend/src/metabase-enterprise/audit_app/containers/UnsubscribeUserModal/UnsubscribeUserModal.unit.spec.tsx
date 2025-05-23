import userEvent from "@testing-library/user-event";
import type { MockResponse, MockResponseFunction } from "fetch-mock";

import {
  findRequests,
  setupAuditUnsubscribeEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { UnsubscribeUserModal } from "./UnsubscribeUserModal";

function setup({
  unsubscribeResponse = undefined,
}: { unsubscribeResponse?: MockResponse | MockResponseFunction } = {}) {
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
    const { onClose } = setup();

    await userEvent.click(await screen.findByText("Unsubscribe"));

    await waitFor(async () => {
      const puts = await findRequests("DELETE");
      expect(puts).toHaveLength(1);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("should display a message on submit failure", async () => {
    const error = { message: "error" };
    const unsubscribeResponse = { status: 404, body: error };
    const { onClose } = setup({ unsubscribeResponse });

    await userEvent.click(await screen.findByText("Unsubscribe"));

    expect(await screen.findByText(error.message)).toBeInTheDocument();
    await waitFor(async () => {
      const puts = await findRequests("DELETE");
      expect(puts).toHaveLength(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
