import userEvent from "@testing-library/user-event";
import { assocIn } from "icepick";

import { renderWithProviders, screen } from "__support__/ui";
import { getMessages, metabotReducer } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { Menu } from "metabase/ui";

import { NewMenuItemAIExploration } from "./NewMenuItemAIExploration";

function setup(
  { hasNlqAccess } = {
    hasNlqAccess: true,
  },
) {
  const metabotInitialState = assocIn(
    getMetabotInitialState(),
    ["conversations", "ask", "messages"],
    [{ id: "1", role: "user", type: "text", message: "hi" }],
  );

  const TestComponent = () => (
    <Menu opened>
      <Menu.Dropdown>
        <NewMenuItemAIExploration hasNlqAccess={hasNlqAccess} />
      </Menu.Dropdown>
    </Menu>
  );

  const { store } = renderWithProviders(
    <Route path="*" element={<TestComponent />} />,
    {
      withRouter: true,
      storeInitialState: createMockState({ metabot: metabotInitialState }),
      customReducers: { metabot: metabotReducer },
    },
  );

  return { store };
}

describe("NewMenuItemAIExploration", () => {
  it("links to the ask mode question page when hasNlqAccess is true", () => {
    setup();

    expect(
      screen.getByRole("menuitem", { name: /AI exploration/ }),
    ).toHaveAttribute("href", "/question/ask");
  });

  it("resets the ask conversation when clicked", async () => {
    const { store } = setup();

    expect(getMessages(store.getState(), "ask")).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("menuitem", { name: /AI exploration/ }),
    );

    expect(getMessages(store.getState(), "ask")).toHaveLength(0);
  });

  it("should link to the research mode page when hasNlqAccess is false", () => {
    setup({
      hasNlqAccess: false,
    });

    expect(
      screen.getByRole("menuitem", { name: /AI exploration/ }),
    ).toHaveAttribute("href", "/question/research");
  });
});
