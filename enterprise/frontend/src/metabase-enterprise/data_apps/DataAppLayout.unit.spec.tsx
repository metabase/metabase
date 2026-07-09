import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";
import { Link, Route } from "metabase/router";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppLayout } from "./DataAppLayout";

const LayoutRoute = ({ params }: { params: { name: string } }) => (
  <DataAppLayout params={params}>
    <div>app content</div>
  </DataAppLayout>
);

// `DataAppLayout` reads `window.history.length` at mount to decide whether "Go
// back" makes sense. jsdom keeps it at 1 and the memory router doesn't touch it,
// so we shadow it per-test to model a fresh tab (1) vs. an app opened from
// another page in the same tab (>1).
const mockHistoryLength = (length: number) => {
  Object.defineProperty(window.history, "length", {
    configurable: true,
    get: () => length,
  });
};

afterEach(() => {
  delete (window.history as { length?: number }).length;
});

const setup = (apps: DataApp[], name = "sales") => {
  fetchMock.get("path:/api/apps", apps);

  return renderWithProviders(
    <Route path="/apps/:name" component={LayoutRoute} />,
    { withRouter: true, initialRoute: `/apps/${name}` },
  );
};

describe("DataAppLayout", () => {
  it("renders the app content and the switcher", async () => {
    setup([createMockDataApp({ name: "sales", display_name: "Sales" })]);

    expect(screen.getByText("app content")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Switch data app" }),
    ).toBeInTheDocument();
    // The list query resolves and the switcher settles on the current app.
    expect(await screen.findByDisplayValue("Sales")).toBeInTheDocument();
  });

  describe("Go back", () => {
    it("is hidden when the app opened with no history (new tab / direct URL)", () => {
      mockHistoryLength(1);
      setup([createMockDataApp({ name: "sales" })]);

      expect(
        screen.queryByRole("button", { name: /Go back/ }),
      ).not.toBeInTheDocument();
    });

    it("returns to the previous page when the app opened from another page", async () => {
      mockHistoryLength(2);
      fetchMock.get("path:/api/apps", [createMockDataApp({ name: "sales" })]);

      const { history } = renderWithProviders(
        <>
          <Route
            path="/home"
            component={() => <Link to="/apps/sales">open app</Link>}
          />
          <Route path="/apps/:name" component={LayoutRoute} />
        </>,
        { withRouter: true, initialRoute: "/home" },
      );

      // Enter the app from /home so there's a page behind us in history.
      await userEvent.click(screen.getByRole("link", { name: "open app" }));
      await userEvent.click(screen.getByRole("button", { name: /Go back/ }));

      expect(history?.getCurrentLocation().pathname).toBe("/home");
    });
  });

  describe("app switcher", () => {
    it("offers enabled apps plus the current app, hiding other disabled apps", async () => {
      setup(
        [
          createMockDataApp({
            name: "sales",
            display_name: "Sales",
            enabled: true,
          }),
          createMockDataApp({
            name: "ops",
            display_name: "Ops",
            enabled: true,
          }),
          createMockDataApp({
            name: "old",
            display_name: "Old",
            enabled: false,
          }),
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
          createMockDataApp({
            name: "ops",
            display_name: "Ops",
            enabled: true,
          }),
        ],
        "sales",
      );

      await screen.findByDisplayValue("Sales");
      await userEvent.click(
        screen.getByRole("textbox", { name: "Switch data app" }),
      );
      const listbox = await screen.findByRole("listbox");
      await userEvent.click(within(listbox).getByText("Ops"));

      expect(history?.getCurrentLocation().pathname).toBe("/apps/ops");
    });
  });
});
