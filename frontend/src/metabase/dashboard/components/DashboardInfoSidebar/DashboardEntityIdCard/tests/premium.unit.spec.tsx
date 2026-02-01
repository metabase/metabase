import userEvent from "@testing-library/user-event";

import { type RenderWithProvidersOptions, screen } from "__support__/ui";
import type { BaseEntityId, Dashboard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { setup as baseSetup } from "./setup";

const setup = ({
  dashboard = createMockDashboard(),
  ...renderOptions
}: {
  dashboard?: Dashboard;
} & RenderWithProvidersOptions = {}) => {
  return baseSetup({
    dashboard,
    enableSerialization: true,
    ...renderOptions,
  });
};

describe("DashboardEntityIdCard (EE with token)", () => {
  it("should display all tabs from the dashboard when expanded", async () => {
    const tabs = [
      createMockDashboardTab({
        id: 1,
        name: "Tab 1",
        entity_id: "tab-1-entity-id" as BaseEntityId,
      }),
      createMockDashboardTab({
        id: 2,
        name: "Tab 2",
        entity_id: "tab-2-entity-id" as BaseEntityId,
      }),
      createMockDashboardTab({
        id: 3,
        name: "Tab 3",
        entity_id: "tab-3-entity-id" as BaseEntityId,
      }),
    ];
    const dashboard = createMockDashboard({
      tabs,
    });
    setup({ dashboard });

    await userEvent.click(
      await screen.findByRole("heading", { name: /Entity ID/ }),
    );

    expect(
      await screen.findByRole("listitem", { name: "This dashboard" }),
    ).toBeInTheDocument();

    for (const tab of tabs) {
      expect(
        await screen.findByRole("listitem", { name: tab.name }),
      ).toHaveTextContent(tab.entity_id as string);
    }
  });

  it("does not display a select, if there are no tabs", () => {
    setup();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
