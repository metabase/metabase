import fetchMock from "fetch-mock";

import { setupCurrentUserEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { LoadCurrentUser } from "./LoadCurrentUser";

describe("LoadCurrentUser", () => {
  const setup = () =>
    renderWithProviders(
      <Route element={<LoadCurrentUser />}>
        <Route path="/" element={<div>app content</div>} />
      </Route>,
      {
        storeInitialState: createMockState({ currentUser: undefined }),
        withRouter: true,
        initialRoute: "/",
      },
    );

  it("gates its children until the current user has loaded", async () => {
    setupCurrentUserEndpoint(createMockUser());
    setup();

    expect(screen.queryByText("app content")).not.toBeInTheDocument();

    expect(await screen.findByText("app content")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/user/current")).toHaveLength(
      1,
    );
  });
});
