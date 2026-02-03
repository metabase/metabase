import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, DashboardSubscription } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardSubscription,
} from "metabase-types/api/mocks";

import { MutableParametersSection } from "./MutableParametersSection";

type SetupOpts = {
  parameters: UiParameter[];
  dashboard: Dashboard;
  pulse: DashboardSubscription;
};

function setup({ parameters, dashboard, pulse }: SetupOpts) {
  const setPulseParameters = jest.fn();

  renderWithProviders(
    <MutableParametersSection
      parameters={parameters}
      dashboard={dashboard}
      pulse={pulse}
      setPulseParameters={setPulseParameters}
    />,
  );

  return { setPulseParameters };
}

describe("MutableParametersSection", () => {
  it.each([
    "string/contains",
    "string/does-not-contain",
    "string/starts-with",
    "string/ends-with",
  ])(
    "should set default parameter options for string operators that have them",
    async (type) => {
      const parameter = createMockUiParameter({
        name: "Text",
        type,
      });
      const { setPulseParameters } = setup({
        parameters: [parameter],
        dashboard: createMockDashboard(),
        pulse: createMockDashboardSubscription({
          parameters: [parameter],
        }),
      });

      await userEvent.click(screen.getByText("Text"));
      await userEvent.type(
        screen.getByPlaceholderText("Enter some text"),
        "abc",
      );
      await userEvent.click(screen.getByText("Add filter"));

      expect(setPulseParameters).toHaveBeenCalledWith([
        { ...parameter, value: ["abc"], options: { "case-sensitive": false } },
      ]);
    },
  );

  it("should not set default parameter options for string operators that do not have them", async () => {
    const parameter = createMockUiParameter({
      name: "Text",
      type: "string/=",
    });
    const { setPulseParameters } = setup({
      parameters: [parameter],
      dashboard: createMockDashboard(),
      pulse: createMockDashboardSubscription({
        parameters: [parameter],
      }),
    });

    await userEvent.click(screen.getByText("Text"));
    await userEvent.type(screen.getByPlaceholderText("Enter some text"), "abc");
    await userEvent.click(screen.getByText("Add filter"));

    expect(setPulseParameters).toHaveBeenCalledWith([
      { ...parameter, value: ["abc"], options: undefined },
    ]);
  });

  describe("parameter ordering", () => {
    it("should display dashboard-level parameters before inline parameters", () => {
      const dashboardParam = createMockUiParameter({
        id: "dashboard-param",
        name: "Dashboard Level Parameter",
      });
      const inlineParam = createMockUiParameter({
        id: "inline-param",
        name: "Inline Parameter",
      });

      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            row: 0,
            col: 0,
            inline_parameters: ["inline-param"],
          }),
        ],
      });

      setup({
        parameters: [inlineParam, dashboardParam], // Pass inline first
        dashboard,
        pulse: createMockDashboardSubscription(),
      });

      const parameterWidgets = screen.getAllByTestId("parameter-widget");
      expect(parameterWidgets).toHaveLength(2);

      // Dashboard parameter should come first despite being passed second
      expect(parameterWidgets[0]).toHaveTextContent(
        "Dashboard Level Parameter",
      );
      expect(parameterWidgets[1]).toHaveTextContent("Inline Parameter");
    });

    it("should sort inline parameters by dashcard position (row first, then column)", () => {
      const param1 = createMockUiParameter({
        id: "param-1",
        name: "Parameter 1",
      });
      const param2 = createMockUiParameter({
        id: "param-2",
        name: "Parameter 2",
      });
      const param3 = createMockUiParameter({
        id: "param-3",
        name: "Parameter 3",
      });
      const param4 = createMockUiParameter({
        id: "param-4",
        name: "Parameter 4",
      });

      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            row: 1,
            col: 0,
            inline_parameters: ["param-3"],
          }),
          createMockDashboardCard({
            id: 2,
            row: 0,
            col: 2,
            inline_parameters: ["param-2"],
          }),
          createMockDashboardCard({
            id: 3,
            row: 0,
            col: 0,
            inline_parameters: ["param-1"],
          }),
          createMockDashboardCard({
            id: 4,
            row: 1,
            col: 1,
            inline_parameters: ["param-4"],
          }),
        ],
      });

      setup({
        parameters: [param3, param2, param4, param1], // Pass in random order
        dashboard,
        pulse: createMockDashboardSubscription(),
      });

      const parameterWidgets = screen.getAllByTestId("parameter-widget");
      expect(parameterWidgets).toHaveLength(4);

      // Should be ordered by row first, then column
      expect(parameterWidgets[0]).toHaveTextContent("Parameter 1"); // row 0, col 0
      expect(parameterWidgets[1]).toHaveTextContent("Parameter 2"); // row 0, col 2
      expect(parameterWidgets[2]).toHaveTextContent("Parameter 3"); // row 1, col 0
      expect(parameterWidgets[3]).toHaveTextContent("Parameter 4"); // row 1, col 1
    });

    it("should handle mixed dashcard types correctly", () => {
      const dashboardParam = createMockUiParameter({
        id: "dashboard-param",
        name: "Dashboard Parameter",
      });
      const inlineParam1 = createMockUiParameter({
        id: "inline-1",
        name: "Inline Parameter 1",
      });
      const inlineParam2 = createMockUiParameter({
        id: "inline-2",
        name: "Inline Parameter 2",
      });

      const dashboard = createMockDashboard({
        dashcards: [
          createMockActionDashboardCard({
            id: 1,
            row: 0,
            col: 0,
            // Action cards don't have inline_parameters
          }),
          createMockDashboardCard({
            id: 2,
            row: 0,
            col: 1,
            inline_parameters: ["inline-1"],
          }),
          createMockDashboardCard({
            id: 3,
            row: 0,
            col: 2,
            inline_parameters: ["inline-2"],
          }),
        ],
      });

      setup({
        parameters: [inlineParam2, dashboardParam, inlineParam1],
        dashboard,
        pulse: createMockDashboardSubscription(),
      });

      const parameterWidgets = screen.getAllByTestId("parameter-widget");
      expect(parameterWidgets).toHaveLength(3);

      // Dashboard parameter first, then inline parameters by position
      expect(parameterWidgets[0]).toHaveTextContent("Dashboard Parameter");
      expect(parameterWidgets[1]).toHaveTextContent("Inline Parameter 1"); // col 1
      expect(parameterWidgets[2]).toHaveTextContent("Inline Parameter 2"); // col 2
    });

    it("should handle dashcards with multiple inline parameters", () => {
      const param1 = createMockUiParameter({
        id: "param-1",
        name: "Parameter 1",
      });
      const param2 = createMockUiParameter({
        id: "param-2",
        name: "Parameter 2",
      });
      const param3 = createMockUiParameter({
        id: "param-3",
        name: "Parameter 3",
      });

      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            row: 0,
            col: 1,
            inline_parameters: ["param-2", "param-3"],
          }),
          createMockDashboardCard({
            id: 2,
            row: 0,
            col: 0,
            inline_parameters: ["param-1"],
          }),
        ],
      });

      setup({
        parameters: [param2, param3, param1], // Pass param2 first to test ordering
        dashboard,
        pulse: createMockDashboardSubscription(),
      });

      const parameterWidgets = screen.getAllByTestId("parameter-widget");
      expect(parameterWidgets).toHaveLength(3);

      // All parameters from col 0 dashcard come before col 1 dashcard
      expect(parameterWidgets[0]).toHaveTextContent("Parameter 1"); // row 0, col 0
      // Parameters within the same dashcard maintain their order from inline_parameters array
      expect(parameterWidgets[1]).toHaveTextContent("Parameter 2"); // row 0, col 1 (first in inline_parameters)
      expect(parameterWidgets[2]).toHaveTextContent("Parameter 3"); // row 0, col 1 (second in inline_parameters)
    });

    it("should handle empty inline_parameters arrays", () => {
      const dashboardParam = createMockUiParameter({
        id: "dashboard-param",
        name: "Dashboard Parameter",
      });

      const dashboard = createMockDashboard({
        dashcards: [
          createMockDashboardCard({
            id: 1,
            row: 0,
            col: 0,
            inline_parameters: [], // Empty array
          }),
        ],
      });

      setup({
        parameters: [dashboardParam],
        dashboard,
        pulse: createMockDashboardSubscription(),
      });

      const parameterWidgets = screen.getAllByTestId("parameter-widget");
      expect(parameterWidgets).toHaveLength(1);
      expect(parameterWidgets[0]).toHaveTextContent("Dashboard Parameter");
    });
  });
});
