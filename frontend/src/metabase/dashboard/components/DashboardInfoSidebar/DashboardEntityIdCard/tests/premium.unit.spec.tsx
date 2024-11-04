import userEvent from "@testing-library/user-event";

import { viewMantineSelectOptions } from "__support__/components/mantineSelect";
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
    withFeatures: ["serialization"],
    ...renderOptions,
  });
};

describe("DashboardEntityIdCard (EE with token)", () => {
  it("should display all tabs from the dashboard as options in the Select", async () => {
    const dashboard = createMockDashboard({
      tabs: [
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
      ],
    });
    setup({ dashboard });

    const firstClickOnSelect = await viewMantineSelectOptions();
    expect(firstClickOnSelect.displayedOption.value).toBe("Tab 1");
    expect(firstClickOnSelect.optionTextContents).toEqual([
      "Tab 1",
      "Tab 2",
      "Tab 3",
    ]);
    expect(await screen.findByText("tab-1-entity-id")).toBeInTheDocument();

    await userEvent.click(firstClickOnSelect.optionElements[1]);
    expect(await screen.findByText("tab-2-entity-id")).toBeInTheDocument();

    const secondClickOnSelect = await viewMantineSelectOptions();
    expect(secondClickOnSelect.displayedOption.value).toBe("Tab 2");
    await userEvent.click(secondClickOnSelect.optionElements[2]);
    expect(await screen.findByText("tab-3-entity-id")).toBeInTheDocument();
  });

  it("does not display a select, if there are no tabs", () => {
    setup();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
