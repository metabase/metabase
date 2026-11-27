import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { screen, within } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";

import { TEST_STRUCTURED_CARD, setup } from "./test-utils";

registerVisualizations();

describe("QueryBuilder > trash", () => {
  it("shows restore and delete actions right after moving question to trash", async () => {
    const card = TEST_STRUCTURED_CARD;
    setupListNotificationEndpoints({ card_id: card.id }, []);
    await setup({ card });
    const archivedCard = {
      ...card,
      archived: true,
      can_write: false,
      can_restore: true,
      can_delete: true,
    };
    fetchMock.modifyRoute(`card-${card.id}-put`, { response: archivedCard });
    fetchMock.modifyRoute(`card-${card.id}-get`, { response: archivedCard });

    await userEvent.click(
      screen.getByRole("button", { name: "Move, trash, and more…" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Move to trash/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Move to trash",
      }),
    );

    const banner = await screen.findByTestId("archive-banner");
    expect(await within(banner).findByText("Restore")).toBeInTheDocument();
    expect(within(banner).getByText("Delete permanently")).toBeInTheDocument();
  });
});
