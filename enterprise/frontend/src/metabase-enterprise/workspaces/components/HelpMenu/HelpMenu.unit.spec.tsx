import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";

import { HelpMenu } from "./HelpMenu";

function setup() {
  renderWithProviders(<HelpMenu />, {
    withRouter: true,
    storeInitialState: {
      settings: createMockSettingsState(
        createMockSettings({ "show-metabase-links": true }),
      ),
    },
  });
}

describe("HelpMenu", () => {
  it("renders two docs links in the menu", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: /Help/ }));

    expect(
      await screen.findByRole("menuitem", { name: /File-based development/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Using remote sync/ }),
    ).toBeInTheDocument();
  });
});
