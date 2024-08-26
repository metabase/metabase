import { renderWithProviders, screen } from "__support__/ui";
import { createMockParameter } from "metabase-types/api/mocks";

import FormattedParameterValue, {
  type FormattedParameterValueProps,
} from "./FormattedParameterValue";

type SetupOpts = FormattedParameterValueProps;

function setup({ parameter, value, placeholder }: SetupOpts) {
  return renderWithProviders(
    <FormattedParameterValue
      parameter={parameter}
      value={value}
      placeholder={placeholder}
    />,
  );
}

describe("FormattedParameterValue", () => {
  it("should render the custom label for a parameter value if it exists", () => {
    setup({
      value: "A",
      parameter: createMockParameter({
        values_source_type: "static-list",
        values_source_config: {
          values: [["A", "Custom Label"], ["B"]],
        },
      }),
    });

    expect(screen.getByText("Custom Label")).toBeInTheDocument();
  });

  it("should render the custom label for a parameter value if does not exist", () => {
    setup({
      value: "B",
      parameter: createMockParameter({
        values_source_type: "static-list",
        values_source_config: {
          values: [["A", "Custom Label"], ["B"]],
        },
      }),
    });

    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
