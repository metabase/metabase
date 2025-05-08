import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, Pulse } from "metabase-types/api";
import { createMockDashboard, createMockPulse } from "metabase-types/api/mocks";

import { MutableParametersSection } from "./MutableParametersSection";

type SetupOpts = {
  parameters: UiParameter[];
  dashboard: Dashboard;
  pulse: Pulse;
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
        pulse: createMockPulse({
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
      pulse: createMockPulse({
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
});
