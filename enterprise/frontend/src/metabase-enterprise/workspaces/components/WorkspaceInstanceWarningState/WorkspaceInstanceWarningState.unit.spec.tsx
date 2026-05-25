import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/urls";

import { WorkspaceInstanceWarningState } from "./WorkspaceInstanceWarningState";

function setup() {
  renderWithProviders(
    <>
      <Route path="/" component={WorkspaceInstanceWarningState} />
      <Route
        path={Urls.workspaceInstance()}
        component={() => <div>Workspace instance page</div>}
      />
    </>,
    { withRouter: true },
  );
}

describe("WorkspaceInstanceWarningState", () => {
  it("redirects to the current workspace page when the button is clicked", async () => {
    setup();

    expect(
      screen.getByText(
        /You cannot manage workspaces when the current instance is in a workspace itself/,
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", { name: /Go to the current workspace/ }),
    );

    expect(
      await screen.findByText("Workspace instance page"),
    ).toBeInTheDocument();
  });
});
