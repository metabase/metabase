import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import { DataAppLayout } from "./DataAppLayout";

describe("DataAppLayout", () => {
  it("renders the data-app content", () => {
    renderWithProviders(
      <Route
        path=":name"
        element={
          <DataAppLayout>
            <div>app content</div>
          </DataAppLayout>
        }
      />,
      { withRouter: true, initialRoute: "/sales" },
    );

    expect(screen.getByText("app content")).toBeInTheDocument();
  });
});
