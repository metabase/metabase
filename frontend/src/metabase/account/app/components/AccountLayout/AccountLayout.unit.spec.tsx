import { renderWithProviders, screen } from "__support__/ui";
import { IndexRoute, Route } from "metabase/router";
import type { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import AccountLayout from "./AccountLayout";

type SetupOpts = {
  user?: User;
};

function setup({ user = createMockUser() }: SetupOpts = {}) {
  renderWithProviders(
    <Route
      path="/"
      element={<AccountLayout user={user} onChangeLocation={() => {}} />}
    >
      <IndexRoute element={<>Content</>} />
    </Route>,
    { withRouter: true, initialRoute: "/" },
  );
}

describe("AccountLayout", () => {
  it("should render header and content", () => {
    setup({
      user: createMockUser({
        id: 1,
        first_name: "John",
        last_name: "Doe",
        email: "john@metabase.test",
      }),
    });

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
