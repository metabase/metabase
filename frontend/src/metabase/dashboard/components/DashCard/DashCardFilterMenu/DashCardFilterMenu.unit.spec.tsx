import userEvent from "@testing-library/user-event";

import { createMockDashboardState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as dashboardActions from "metabase/dashboard/actions";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  createMockDashboard,
  createMockParameter,
} from "metabase-types/api/mocks";

import { DashCardFilterMenu } from "./DashCardFilterMenu";

const CATEGORY = createMockParameter({
  id: "category",
  name: "Category",
  slug: "category",
  type: "string/=",
});

const VENDOR = createMockParameter({
  id: "vendor",
  name: "Vendor",
  slug: "vendor",
  type: "string/=",
});

interface SetupOpts {
  parameters: UiParameter[];
  isEditing?: boolean;
}

const setup = ({ parameters, isEditing = false }: SetupOpts) => {
  const dashboard = createMockDashboard({ parameters });
  const parameterValues = Object.fromEntries(
    parameters.map((parameter) => [parameter.id, parameter.value ?? null]),
  );

  renderWithProviders(
    <MockDashboardContext
      dashboardId={dashboard.id}
      dashboard={dashboard}
      parameters={parameters}
      parameterValues={parameterValues}
      isEditing={isEditing}
    >
      <DashCardFilterMenu parameters={parameters} />
    </MockDashboardContext>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: { [dashboard.id]: { ...dashboard, dashcards: [] } },
          parameterValues,
        }),
      },
    },
  );
};

const getTrigger = () => screen.getByTestId("show-filter-parameter-button");

describe("DashCardFilterMenu", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should show a plain filter button when no filter has a value", () => {
    setup({ parameters: [CATEGORY, VENDOR] });

    expect(getTrigger()).toHaveAccessibleName("Show filters");
    expect(getTrigger()).not.toHaveAttribute("data-active");
    expect(
      screen.queryByTestId("show-filter-parameter-count"),
    ).not.toBeInTheDocument();
  });

  it("should count the filters that have a value", () => {
    setup({
      parameters: [{ ...CATEGORY, value: ["Gadget"] }, VENDOR],
    });

    expect(getTrigger()).toHaveAttribute("data-active");
    expect(screen.getByTestId("show-filter-parameter-count")).toHaveTextContent(
      "1",
    );
  });

  it("should list the filters and open the picked one, with a way back to the list", async () => {
    setup({ parameters: [CATEGORY, VENDOR] });

    await userEvent.click(getTrigger());
    const dropdown = within(
      await screen.findByTestId("show-filter-parameter-dropdown"),
    );
    expect(dropdown.getByRole("menuitem", { name: /Category/ })).toBeVisible();
    expect(dropdown.getByRole("menuitem", { name: /Vendor/ })).toBeVisible();

    await userEvent.click(dropdown.getByRole("menuitem", { name: /Vendor/ }));
    expect(dropdown.getByRole("button", { name: /Vendor/ })).toBeVisible();
    expect(dropdown.getByPlaceholderText("Enter some text")).toBeVisible();
    expect(dropdown.queryByRole("menuitem")).not.toBeInTheDocument();

    await userEvent.click(dropdown.getByRole("button", { name: /Vendor/ }));
    expect(dropdown.getByRole("menuitem", { name: /Category/ })).toBeVisible();
    expect(dropdown.getByRole("menuitem", { name: /Vendor/ })).toBeVisible();
  });

  it("should set the filter value and close when a value is applied", async () => {
    const setParameterValue = jest.spyOn(dashboardActions, "setParameterValue");
    setup({ parameters: [CATEGORY] });

    await userEvent.click(getTrigger());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Category/ }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("Enter some text"),
      "Gadget{enter}",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

    expect(setParameterValue).toHaveBeenCalledWith("category", ["Gadget"]);
    expect(
      screen.queryByTestId("show-filter-parameter-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should open the filter settings instead of the value picker while editing the dashboard", async () => {
    const setEditingParameter = jest.spyOn(
      dashboardActions,
      "setEditingParameter",
    );
    setup({ parameters: [CATEGORY, VENDOR], isEditing: true });

    await userEvent.click(getTrigger());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Vendor/ }),
    );

    expect(setEditingParameter).toHaveBeenCalledWith("vendor");
    expect(
      screen.queryByTestId("show-filter-parameter-dropdown"),
    ).not.toBeInTheDocument();
  });
});
