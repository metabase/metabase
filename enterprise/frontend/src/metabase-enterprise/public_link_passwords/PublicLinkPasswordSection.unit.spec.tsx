import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { PublicLinkPasswordSection } from "./PublicLinkPasswordSection";

// `metabase/analytics` is auto-mocked globally (see frontend/test/__support__/mocks.js),
// so `trackSimpleEvent` is already a jest.fn() here.
const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

function setup({ hasPassword = false }: { hasPassword?: boolean } = {}) {
  fetchMock.get("path:/api/card/1/public_password", {
    has_password: hasPassword,
  });
  fetchMock.post("path:/api/card/1/public_password/reveal", {
    password: "secret123",
  });
  fetchMock.put("path:/api/card/1/public_password", 200);
  fetchMock.delete("path:/api/card/1/public_password", 200);

  renderWithProviders(
    <PublicLinkPasswordSection
      entityType="card"
      entityId={1}
      onRemoveLink={jest.fn()}
    />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

describe("PublicLinkPasswordSection analytics", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("tracks public_link_password_set when saving a new password", async () => {
    setup();

    const toggle = await screen.findByRole("switch");
    await userEvent.click(toggle);

    const input = screen.getByPlaceholderText(/Enter a password/i);
    await userEvent.type(input, "password123");

    const saveButton = screen.getByTestId("public-link-password-save");
    await userEvent.click(saveButton);

    await waitFor(() =>
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "public_link_password_set",
        event_detail: "card",
      }),
    );
  });

  it("tracks public_link_password_removed when toggling off an existing password", async () => {
    setup({ hasPassword: true });

    const toggle = await screen.findByRole("switch");
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "public_link_password_removed",
        event_detail: "card",
      }),
    );
  });
});
