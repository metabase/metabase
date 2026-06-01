import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { DatabaseData, DatabaseId, Engine } from "metabase-types/api";
import { createMockEngines } from "metabase-types/api/mocks";

import { DatabaseEditConnectionForm } from "./DatabaseEditConnectionForm";

const postgresEngine = {
  source: { type: "official", contact: null },
  "details-fields": [
    {
      name: "dbname",
      "display-name": "Database name",
      placeholder: "birds_of_the_world",
      required: true,
    },
    {
      name: "user",
      "display-name": "Username",
      placeholder: "username",
      required: true,
    },
  ],
  "driver-name": "PostgreSQL",
  "superseded-by": null,
  "extra-info": null,
} satisfies Engine;

const setup = ({
  handleSaveDb,
}: {
  handleSaveDb: (database: DatabaseData) => Promise<{ id: DatabaseId }>;
}) => {
  const state = createMockState({
    settings: mockSettings({
      engines: createMockEngines({ postgres: postgresEngine }),
    }),
  });

  renderWithProviders(
    <Route
      path="/admin/databases/create"
      component={(routeProps: { route: any; location: any }) => (
        <DatabaseEditConnectionForm
          database={{ engine: "postgres" }}
          isAttachedDWH={false}
          handleSaveDb={handleSaveDb}
          onSubmitted={jest.fn()}
          onCancel={jest.fn()}
          formLocation="full-page"
          route={routeProps.route}
        />
      )}
    />,
    {
      withRouter: true,
      initialRoute: "/admin/databases/create",
      storeInitialState: state,
    },
  );
};

const fillRequiredFieldsAndSave = async () => {
  await userEvent.type(screen.getByLabelText("Display name"), "Test");
  await userEvent.type(screen.getByLabelText("Database name"), "db");
  await userEvent.type(screen.getByLabelText("Username"), "admin");
  const saveButton = screen.getByRole("button", { name: "Save" });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await userEvent.click(saveButton);
};

describe("DatabaseEditConnectionForm submission errors", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders a plain-string error body as the form error message", async () => {
    setup({
      handleSaveDb: () =>
        Promise.reject({ status: 400, data: "DATABASE CONNECTION ERROR" }),
    });

    await fillRequiredFieldsAndSave();

    expect(
      await screen.findByText("DATABASE CONNECTION ERROR"),
    ).toBeInTheDocument();
  });

  it("translates host/port errors into the host/port-specific message", async () => {
    setup({
      handleSaveDb: () =>
        Promise.reject({
          status: 400,
          data: {
            message: "DATABASE CONNECTION ERROR",
            errors: {
              host: "Check your host",
              port: "Check your port",
            },
          },
        }),
    });

    await fillRequiredFieldsAndSave();

    expect(
      await screen.findByText(
        /Make sure your Host and Port settings are correct/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("DATABASE CONNECTION ERROR"),
    ).not.toBeInTheDocument();
  });
});
