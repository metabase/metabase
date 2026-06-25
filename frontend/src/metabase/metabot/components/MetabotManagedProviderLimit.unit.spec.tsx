import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as aiProviderConfigurationFormModule from "metabase/metabot/components/AIProviderConfigurationForm/AIProviderConfigurationForm";
import { createMockUser } from "metabase-types/api/mocks";

import { getMetabotManagedProviderLimitToastProps } from "./MetabotManagedProviderLimit";

describe("getMetabotManagedProviderLimitToastProps", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest
      .spyOn(aiProviderConfigurationFormModule, "AIProviderConfigurationForm")
      .mockImplementation(() => (
        <div>Mocked AI provider configuration form</div>
      ));
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
            } as any,
          ],
        },
      },
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Use a different AI provider" }),
    );

    expect(
      screen.getByText("Mocked AI provider configuration form"),
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
