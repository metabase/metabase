import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppLayout } from "./DataAppLayout";

const LayoutRoute = ({ params }: { params: { name: string } }) => {
  return (
    <DataAppLayout params={params}>
      <div>app content</div>
    </DataAppLayout>
  );
};

const setup = (apps: DataApp[], name = "sales") => {
  fetchMock.get("path:/api/data-app", apps);

  return renderWithProviders(
    <>
      <Route path="/data-app/:name" component={LayoutRoute} />
      <Route
        path="/admin/settings/data-apps"
        component={() => <div>settings page</div>}
      />
    </>,
    { withRouter: true, initialRoute: `/data-app/${name}` },
  );
};

describe("DataAppLayout", () => {
  it("renders the app content and the switcher chrome", async () => {
    setup([createMockDataApp({ name: "sales", display_name: "Sales" })]);

    expect(screen.getByText("app content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go back/ })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Switch data app" }),
    ).toBeInTheDocument();
    // The list query resolves and the switcher settles on the current app.
    expect(await screen.findByDisplayValue("Sales")).toBeInTheDocument();
  });

  it("navigates back to the data-apps settings page", async () => {
    const { history } = setup([createMockDataApp({ name: "sales" })]);

    await userEvent.click(screen.getByRole("button", { name: /Go back/ }));

    expect(history?.getCurrentLocation().pathname).toBe(
      "/admin/settings/data-apps",
    );
  });

  it("offers enabled apps plus the current app, hiding other disabled apps", async () => {
    setup(
      [
        createMockDataApp({
          name: "sales",
          display_name: "Sales",
          enabled: true,
        }),
        createMockDataApp({ name: "ops", display_name: "Ops", enabled: true }),
        createMockDataApp({ name: "old", display_name: "Old", enabled: false }),
      ],
      "sales",
    );

    // Wait for the list query to resolve before opening the switcher.
    await screen.findByDisplayValue("Sales");
    await userEvent.click(
      screen.getByRole("textbox", { name: "Switch data app" }),
    );

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Sales")).toBeInTheDocument();
    expect(within(listbox).getByText("Ops")).toBeInTheDocument();
    expect(within(listbox).queryByText("Old")).not.toBeInTheDocument();
  });

  it("navigates to the chosen app when the switcher changes", async () => {
    const { history } = setup(
      [
        createMockDataApp({
          name: "sales",
          display_name: "Sales",
          enabled: true,
        }),
        createMockDataApp({ name: "ops", display_name: "Ops", enabled: true }),
      ],
      "sales",
    );

    await screen.findByDisplayValue("Sales");
    await userEvent.click(
      screen.getByRole("textbox", { name: "Switch data app" }),
    );
    const listbox = await screen.findByRole("listbox");
    await userEvent.click(within(listbox).getByText("Ops"));

    expect(history?.getCurrentLocation().pathname).toBe("/data-app/ops");
  });
});
