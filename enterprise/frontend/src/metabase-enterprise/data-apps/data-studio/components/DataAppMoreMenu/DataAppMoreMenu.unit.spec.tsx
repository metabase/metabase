import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupUpdateDataAppEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppMoreMenu } from "./DataAppMoreMenu";

type SetupOpts = {
  app: DataApp;
};

function setup({ app }: SetupOpts) {
  setupUpdateDataAppEndpoint({ ...app, enabled: !app.enabled });
  renderWithProviders(<DataAppMoreMenu app={app} />, { withRouter: true });
}

const openMenu = () =>
  userEvent.click(screen.getByRole("button", { name: "Data app options" }));

describe("DataAppMoreMenu", () => {
  it("offers to open a live app, make it a draft, and manage its groups", async () => {
    setup({ app: createMockDataApp({ name: "sales", enabled: true }) });

    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /Open app/ }),
    ).toHaveAttribute("href", "/apps/sales");
    expect(
      screen.getByRole("menuitem", { name: /Make draft/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Manage group access/ }),
    ).toHaveAttribute("href", "/admin/settings/apps/sales/groups");
  });

  it("does not offer to open a draft app", async () => {
    setup({ app: createMockDataApp({ enabled: false }) });

    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /Make live/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Open app/ }),
    ).not.toBeInTheDocument();
  });

  it("makes a live app a draft only after confirmation", async () => {
    setup({
      app: createMockDataApp({
        name: "sales",
        display_name: "Sales",
        enabled: true,
      }),
    });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Make draft/ }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Make Sales a draft?")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/apps/sales")).toHaveLength(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Make draft" }),
    );

    const calls = fetchMock.callHistory.calls("path:/api/apps/sales");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].options.body))).toEqual({
      enabled: false,
    });
  });
});
