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
  hideParameters?: string;
}

const setup = ({
  parameters,
  isEditing = false,
  hideParameters,
}: SetupOpts) => {
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
      hideParameters={hideParameters}
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

  it("should leave hidden filters out of the list and the count", async () => {
    setup({
      parameters: [{ ...CATEGORY, value: ["Gadget"] }, VENDOR],
      hideParameters: "category",
    });

    expect(getTrigger()).not.toHaveAttribute("data-active");
    expect(
      screen.queryByTestId("show-filter-parameter-count"),
    ).not.toBeInTheDocument();

    await userEvent.click(getTrigger());
    const dropdown = within(
      await screen.findByTestId("show-filter-parameter-dropdown"),
    );
    expect(dropdown.getByRole("menuitem", { name: /Vendor/ })).toBeVisible();
    expect(
      dropdown.queryByRole("menuitem", { name: /Category/ }),
    ).not.toBeInTheDocument();
  });

  it("should render nothing when every filter is hidden", () => {
    setup({ parameters: [CATEGORY], hideParameters: "category" });

    expect(
      screen.queryByTestId("show-filter-parameter-button"),
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

  it("should set a text variable's value and close when it is committed", async () => {
    const setParameterValue = jest.spyOn(dashboardActions, "setParameterValue");
    setup({
      parameters: [
        {
          ...CATEGORY,
          hasVariableTemplateTagTarget: true,
          values_query_type: "none",
        },
      ],
    });

    await userEvent.click(getTrigger());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Category/ }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("Enter a value..."),
      "Gadget{enter}",
    );

    expect(setParameterValue).toHaveBeenCalledWith("category", "Gadget");
    expect(
      screen.queryByTestId("show-filter-parameter-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should clear the value and close from the filter's header", async () => {
    const setParameterValue = jest.spyOn(dashboardActions, "setParameterValue");
    setup({ parameters: [{ ...CATEGORY, value: ["Gadget"] }] });

    await userEvent.click(getTrigger());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Category/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(setParameterValue).toHaveBeenCalledWith("category", null);
    expect(
      screen.queryByTestId("show-filter-parameter-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should offer a reset instead of a clear when the value differs from the default", async () => {
    const setParameterValueToDefault = jest.spyOn(
      dashboardActions,
      "setParameterValueToDefault",
    );
    setup({
      parameters: [
        { ...CATEGORY, value: ["Gadget"], default: ["Widget"], required: true },
      ],
    });

    await userEvent.click(getTrigger());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Category/ }),
    );
    expect(
      screen.queryByRole("button", { name: "Clear" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Reset filter to default state" }),
    );

    expect(setParameterValueToDefault).toHaveBeenCalledWith("category");
    expect(
      screen.queryByTestId("show-filter-parameter-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("should offer neither clear nor reset when the filter has no value", async () => {
    setup({ parameters: [CATEGORY] });

    await userEvent.click(getTrigger());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Category/ }),
    );

    expect(
      screen.queryByRole("button", { name: "Clear" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset filter to default state" }),
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
