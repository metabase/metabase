import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as metabotSetupModule from "metabase/admin/ai/MetabotSetup";

import { getMetabotManagedProviderLimitToastProps } from "./MetabotManagedProviderLimit";

describe("getMetabotManagedProviderLimitToastProps", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest
      .spyOn(metabotSetupModule, "MetabotSetupInner")
      .mockImplementation(() => <div>Mocked Metabot Setup</div>);
  });

  it("dismisses the toast only when the configure modal closes", async () => {
    const { store } = renderWithProviders(
      getMetabotManagedProviderLimitToastProps().renderChildren(),
      {
        storeInitialState: {
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

    expect(screen.getByText("Mocked Metabot Setup")).toBeInTheDocument();
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

  it("renders the paid subscription link in the toast", () => {
    renderWithProviders(
      getMetabotManagedProviderLimitToastProps().renderChildren(),
    );

    expect(
      screen.getByRole("link", { name: "Start paid subscription" }),
    ).toHaveAttribute("href", expect.stringContaining("/account/manage/plans"));
  });
});
