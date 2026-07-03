import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen, within } from "__support__/ui";
import { useListDataAppsQuery } from "metabase-enterprise/api";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppLayout } from "./DataAppLayout";

jest.mock("metabase-enterprise/api", () => ({
  ...jest.requireActual("metabase-enterprise/api"),
  useListDataAppsQuery: jest.fn(),
}));

const mockedList = jest.mocked(useListDataAppsQuery);

const LayoutRoute = ({ params }: { params: { name: string } }) => {
  return (
    <DataAppLayout params={params}>
      <div>app content</div>
    </DataAppLayout>
  );
};

const setup = (apps: DataApp[], name = "sales") => {
  mockedList.mockReturnValue({ data: apps } as unknown as ReturnType<
    typeof useListDataAppsQuery
  >);

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
  afterEach(() => jest.clearAllMocks());

  it("renders the app content and the switcher chrome", () => {
    setup([createMockDataApp({ name: "sales", display_name: "Sales" })]);

    expect(screen.getByText("app content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go back/ })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Switch data app" }),
    ).toBeInTheDocument();
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

    await userEvent.click(
      screen.getByRole("textbox", { name: "Switch data app" }),
    );
    const listbox = await screen.findByRole("listbox");
    await userEvent.click(within(listbox).getByText("Ops"));

    expect(history?.getCurrentLocation().pathname).toBe("/data-app/ops");
  });
});
