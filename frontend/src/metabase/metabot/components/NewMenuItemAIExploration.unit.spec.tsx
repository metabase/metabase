import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { metabotReducer } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { Route } from "metabase/router";
import { Menu } from "metabase/ui";

import { NewMenuItemAIExploration } from "./NewMenuItemAIExploration";

function setup() {
  const TestComponent = () => (
    <Menu opened>
      <Menu.Dropdown>
        <NewMenuItemAIExploration />
      </Menu.Dropdown>
    </Menu>
  );

  const { store } = renderWithProviders(
    <Route path="*" element={<TestComponent />} />,
    {
      withRouter: true,
      storeInitialState: createMockState({ metabot: getMetabotInitialState() }),
      customReducers: { metabot: metabotReducer },
    },
  );

  return { store };
}

describe("NewMenuItemAIExploration", () => {
  it("links to the ask mode question page", () => {
    setup();

    expect(
      screen.getByRole("menuitem", { name: /AI exploration/ }),
    ).toHaveAttribute("href", "/question/ask");
  });
});
