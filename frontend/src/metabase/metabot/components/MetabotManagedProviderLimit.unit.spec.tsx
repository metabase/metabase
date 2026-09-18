import userEvent from "@testing-library/user-event";

import {
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockLlmProviderType,
  createMockUser,
} from "metabase-types/api/mocks";

import { getMetabotManagedProviderLimitToastProps } from "./MetabotManagedProviderLimit";

describe("getMetabotManagedProviderLimitToastProps", () => {
  beforeEach(() => {
    setupLlmProviderTypesEndpoint([
      createMockLlmProviderType({ type: "anthropic", label: "Anthropic" }),
    ]);
    setupLlmProvidersEndpoint();
  });

  it("dismisses the toast only when the configure modal closes", async () => {
    const { store } = renderWithProviders(
      getMetabotManagedProviderLimitToastProps().renderChildren(),
      {
        storeInitialState: {
          currentUser: createMockUser({ is_superuser: true }),
          undo: [
            {
              id: "metabot-managed-provider-limit",
              timeoutId: null,
            },
          ],
        },
      },
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Use a different AI provider" }),
    );

    expect(
      await screen.findByRole("button", { name: /Anthropic/ }),
    ).toBeInTheDocument();
    expect(store.getState().undo).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(store.getState().undo).not.toContainEqual(
        expect.objectContaining({
          id: "metabot-managed-provider-limit",
        }),
      );
    });
  });

  it("renders the paid subscription link in the toast for admins", () => {
    renderWithProviders(
      getMetabotManagedProviderLimitToastProps().renderChildren(),
      {
        storeInitialState: {
          currentUser: createMockUser({ is_superuser: true }),
        },
      },
    );

    expect(
      screen.getByRole("link", { name: "Start paid subscription" }),
    ).toHaveAttribute("href", expect.stringContaining("/account/manage/plans"));
  });

  it("shows an 'ask your admin' message for non-admins instead of the action buttons", () => {
    renderWithProviders(
      getMetabotManagedProviderLimitToastProps().renderChildren(),
      {
        storeInitialState: {
          currentUser: createMockUser({ is_superuser: false }),
        },
      },
    );

    expect(
      screen.getByText(
        /Ask your admin to switch AI providers or start a paid subscription/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use a different AI provider" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Start paid subscription" }),
    ).not.toBeInTheDocument();
  });
});
