import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { DatabaseData } from "metabase-types/api";
import { createMockEngines } from "metabase-types/api/mocks";

import { DatabaseEditConnectionForm } from "./DatabaseEditConnectionForm";

interface SetupOpts {
  database?: Partial<DatabaseData>;
  isAttachedDWH?: boolean;
}

function setup({ database, isAttachedDWH = false }: SetupOpts = {}) {
  const storeInitialState = createMockState({
    settings: mockSettings({ engines: createMockEngines() }),
  });

  renderWithProviders(
    <Route
      path="/"
      component={(routerProps) => (
        <DatabaseEditConnectionForm
          {...routerProps}
          database={database}
          isAttachedDWH={isAttachedDWH}
          onSubmitted={jest.fn()}
          onCancel={jest.fn()}
          formLocation="admin"
        />
      )}
    />,
    { withRouter: true, storeInitialState },
  );
}

describe("DatabaseEditConnectionForm", () => {
  it("renders the editable connection form for an ordinary database", () => {
    setup({ database: { id: 1, engine: "postgres" } });

    expect(screen.getByTestId("database-form")).toBeInTheDocument();
    expect(screen.queryByText(/cannot be edited/i)).not.toBeInTheDocument();
  });

  it("replaces the form with an explanation for the sample database", () => {
    setup({ database: { id: 1, is_sample: true, engine: "postgres" } });

    expect(screen.queryByTestId("database-form")).not.toBeInTheDocument();
    expect(
      screen.getByText("The sample database cannot be edited."),
    ).toBeInTheDocument();
  });

  it("replaces the form with an explanation for an attached DWH", () => {
    setup({ database: { id: 1, engine: "postgres" }, isAttachedDWH: true });

    expect(screen.queryByTestId("database-form")).not.toBeInTheDocument();
    expect(
      screen.getByText(/managed by Metabase Cloud and cannot be modified/i),
    ).toBeInTheDocument();
  });
});
