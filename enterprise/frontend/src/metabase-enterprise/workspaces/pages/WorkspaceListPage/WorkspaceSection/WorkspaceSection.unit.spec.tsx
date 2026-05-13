import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/urls";
import {
  createMockDatabase,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { WorkspaceSection } from "./WorkspaceSection";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });
const WORKSPACE = createMockWorkspace({ id: 1, name: "My workspace" });

function setup() {
  renderWithProviders(
    <WorkspaceSection workspace={WORKSPACE} availableDatabases={[POSTGRES]} />,
    { withRouter: true },
  );
}

describe("WorkspaceSection", () => {
  it("renders as a link to the workspace page", () => {
    setup();
    expect(screen.getByRole("link", { name: /My workspace/ })).toHaveAttribute(
      "href",
      Urls.workspace(WORKSPACE.id),
    );
  });
});
