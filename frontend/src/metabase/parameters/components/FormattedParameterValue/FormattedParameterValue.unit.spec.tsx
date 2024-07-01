import fetchMock from "fetch-mock";

import {
  setupErrorParameterValuesEndpoints,
  setupParameterValuesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { ParameterValue } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import FormattedParameterValue, {
  type FormattedParameterValueProps,
} from "./FormattedParameterValue";

type SetupOpts = FormattedParameterValueProps & {
  values?: ParameterValue[];
  error?: boolean;
};

function setup({
  parameter,
  value,
  placeholder,
  values,
  error = false,
}: SetupOpts) {
  if (values) {
    setupParameterValuesEndpoints({
      values,
      has_more_values: false,
    });
  }

  if (error) {
    setupErrorParameterValuesEndpoints();
  }

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

    expect(fetchMock.called()).toBe(false);
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

    expect(fetchMock.called()).toBe(false);
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("should fetch the parameter config if it has not been passed, falling back to the value while loading", async () => {
    setup({
      value: "A",
      parameter: createMockParameter({}),
      values: [["A", "Custom Label"], ["B"]],
    });

    expect(fetchMock.called()).toBe(true);

    // shows the value initially
    expect(screen.getByText("A")).toBeInTheDocument();

    await fetchMock.flush();

    expect(await screen.findByText("Custom Label")).toBeInTheDocument();
  });

  it("should fetch the parameter config if it has not been passed, falling back to the value if there is an error", async () => {
    setup({
      value: "A",
      parameter: createMockParameter({}),
      error: true,
    });

    expect(fetchMock.called()).toBe(true);
    expect(screen.getByText("A")).toBeInTheDocument();

    await fetchMock.flush();

    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
