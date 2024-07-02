import { screen } from "@testing-library/react";
import { Route } from "react-router";

import { renderWithProviders } from "__support__/ui";
import Database from "metabase-lib/v1/metadata/Database";
import type { Database as IDatabase } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { ImpersonationWarning } from "./ImpersonationWarning";

const setup = (database: IDatabase) => {
  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <ImpersonationWarning
          database={new Database({ ...database, tables: [] })}
        />
      )}
    />,
    {
      withRouter: true,
    },
  );
};

describe("ImpersonationWarning", () => {
  it("should render correctly for databases without a user", () => {
    setup(createMockDatabase());
    expect(
      screen.getByText(
        "Make sure the main database credential has access to everything different user groups may need access to. It's what Metabase uses to sync table information.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText(/edit settings/i)).toHaveAttribute(
      "href",
      "/admin/databases/1",
    );
  });

  it("should render correct message for databases with a user", () => {
    setup(
      createMockDatabase({
        name: "My Database",
        details: {
          user: "metabase_user",
        },
      }),
    );

    expect(
      screen.getByText(
        /that all Metabase groups may need access to, as that database user account is what Metabase uses to sync table information./i,
      ),
    ).toBeInTheDocument();

    expect(screen.getByText(/edit settings/i)).toHaveAttribute(
      "href",
      "/admin/databases/1#user",
    );
  });
});
