import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDatabase } from "metabase-types/api/mocks";

import { NewModals } from "./NewModals";

async function setupShortcut() {
  setupDatabasesEndpoints([createMockDatabase()]);
  setupCardsEndpoints([]);
  setupCollectionsEndpoints({ collections: [] });

  renderWithProviders(<Route path="/" element={<NewModals />} />, {
    withRouter: true,
    withKBar: true,
  });

  // The shortcut is registered from an effect; a keystroke dispatched in the
  // same tick as the initial render lands before that and is lost.
  await waitFor(() =>
    expect(fetchMock.callHistory.called(/\/api\/collection/)).toBe(true),
  );
}

describe("NewModals", () => {
  it("toggles the shortcuts modal with ?", async () => {
    await setupShortcut();

    await userEvent.keyboard("{Shift>}?{/Shift}");

    const modal = await screen.findByRole("dialog", { name: "Shortcuts" });
    expect(within(modal).getByRole("tab", { name: "General" })).toBeVisible();
    expect(
      within(modal).getByRole("tab", { name: "Dashboards" }),
    ).toBeVisible();

    await userEvent.keyboard("{Shift>}?{/Shift}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Shortcuts" }),
      ).not.toBeInTheDocument();
    });
  });
});
