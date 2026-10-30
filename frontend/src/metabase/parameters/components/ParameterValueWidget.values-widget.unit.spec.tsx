import userEvent from "@testing-library/user-event";

import { setupParameterValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  FieldValuesType,
  Parameter,
  ParameterValue,
  ParameterValues,
  ValuesQueryType,
} from "metabase-types/api";
import {
  createMockField,
  createMockParameter,
  createMockParameterValues,
} from "metabase-types/api/mocks";

import { ParameterValueWidget } from "./ParameterValueWidget";

const ARITIES = ["single", "multi"] as const;
const QUERY_TYPES = ["search", "dropdown", "plain"] as const;
const ADMIN_TYPES = ["search", "list", "plain"] as const;
const OPERATORS = ["Is", "Contains"] as const;
const SOURCES = ["connected", "card", "custom"] as const;
const RESULTS = ["large", "small"] as const;

const COMPONENTS = [
  "token-field",
  "list-field",
  "single-select-list-field",
] as const;

type ValuesCase = {
  arity: (typeof ARITIES)[number];
  queryType: (typeof QUERY_TYPES)[number];
  adminType: (typeof ADMIN_TYPES)[number];
  operator: (typeof OPERATORS)[number];
  source: (typeof SOURCES)[number];
  results: (typeof RESULTS)[number];
};

type Component = (typeof COMPONENTS)[number];

// Every case that is not in this list renders a token field.
const LIST_CASES: string[] = [
  "single search list Is connected small",
  "single search list Contains connected small",
  "single dropdown search Is custom large",
  "single dropdown search Is custom small",
  "single dropdown search Contains custom large",
  "single dropdown search Contains custom small",
  "single dropdown list Is connected small",
  "single dropdown list Is custom large",
  "single dropdown list Is custom small",
  "single dropdown list Contains connected small",
  "single dropdown list Contains custom large",
  "single dropdown list Contains custom small",
  "single dropdown plain Is custom large",
  "single dropdown plain Is custom small",
  "single dropdown plain Contains custom large",
  "single dropdown plain Contains custom small",
  "multi search list Is connected small",
  "multi search list Contains connected small",
  "multi dropdown search Is custom large",
  "multi dropdown search Is custom small",
  "multi dropdown search Contains custom large",
  "multi dropdown search Contains custom small",
  "multi dropdown list Is connected small",
  "multi dropdown list Is custom large",
  "multi dropdown list Is custom small",
  "multi dropdown list Contains connected small",
  "multi dropdown list Contains custom large",
  "multi dropdown list Contains custom small",
  "multi dropdown plain Is custom large",
  "multi dropdown plain Is custom small",
  "multi dropdown plain Contains custom large",
  "multi dropdown plain Contains custom small",
];

const CASES: ValuesCase[] = ARITIES.flatMap((arity) =>
  QUERY_TYPES.flatMap((queryType) =>
    ADMIN_TYPES.flatMap((adminType) =>
      OPERATORS.flatMap((operator) =>
        SOURCES.flatMap((source) =>
          RESULTS.map((results) => ({
            arity,
            queryType,
            adminType,
            operator,
            source,
            results,
          })),
        ),
      ),
    ),
  ),
);

const FIELD_VALUES_TYPES = {
  search: "search",
  list: "list",
  plain: "none",
} satisfies Record<ValuesCase["adminType"], FieldValuesType>;

const VALUES_QUERY_TYPES = {
  search: "search",
  dropdown: "list",
  plain: "none",
} satisfies Record<ValuesCase["queryType"], ValuesQueryType>;

const STATIC_LIST_SIZES = {
  large: 1050,
  small: 5,
} satisfies Record<ValuesCase["results"], number>;

function caseName(valuesCase: ValuesCase) {
  const { arity, queryType, adminType, operator, source, results } = valuesCase;
  return `${arity} ${queryType} ${adminType} ${operator} ${source} ${results}`;
}

function expectedComponent(valuesCase: ValuesCase): Component {
  if (!LIST_CASES.includes(caseName(valuesCase))) {
    return "token-field";
  }
  return valuesCase.arity === "multi"
    ? "list-field"
    : "single-select-list-field";
}

function staticValues(count: number): ParameterValue[] {
  return Array.from({ length: count }, (_, index) => [`Value ${index}`]);
}

function parameterSource({ source, results }: ValuesCase): Partial<Parameter> {
  switch (source) {
    case "connected":
      return {};
    case "card":
      return {
        values_source_type: "card",
        values_source_config: { card_id: 1, value_field: ["field", 2, null] },
      };
    case "custom":
      return {
        values_source_type: "static-list",
        values_source_config: {
          values: staticValues(STATIC_LIST_SIZES[results]),
        },
      };
  }
}

// What the backend returns for the sample data the cases are based on:
// a large field and a card source have more values than one response holds,
// a static list returns all of its values.
function parameterValues({ source, results }: ValuesCase): ParameterValues {
  switch (source) {
    case "connected":
      return createMockParameterValues({
        values: staticValues(5),
        has_more_values: results === "large",
      });
    case "card":
      return createMockParameterValues({
        values: staticValues(5),
        has_more_values: true,
      });
    case "custom":
      return createMockParameterValues({
        values: staticValues(STATIC_LIST_SIZES[results]),
        has_more_values: false,
      });
  }
}

type SetupOpts = {
  valuesCase: ValuesCase;
};

function setup({ valuesCase }: SetupOpts) {
  setupParameterValuesEndpoints(parameterValues(valuesCase));

  const parameter: UiParameter = {
    ...createMockParameter({
      id: "matrix-param",
      slug: "matrix",
      name: "Matrix",
      type: valuesCase.operator === "Is" ? "string/=" : "string/contains",
      sectionId: "string",
      isMultiSelect: valuesCase.arity === "multi",
      values_query_type: VALUES_QUERY_TYPES[valuesCase.queryType],
      ...parameterSource(valuesCase),
    }),
    fields: [
      createMockField({
        id: 1,
        base_type: "type/Text",
        effective_type: "type/Text",
        has_field_values: FIELD_VALUES_TYPES[valuesCase.adminType],
      }),
    ],
  };

  renderWithProviders(
    <ParameterValueWidget
      parameter={parameter}
      setValue={jest.fn()}
      value={null}
    />,
  );
}

describe("ParameterValueWidget > values widget", () => {
  it.each(CASES.map((valuesCase) => [caseName(valuesCase), valuesCase]))(
    "%s should render the expected widget",
    async (_name, valuesCase) => {
      const component = expectedComponent(valuesCase);
      setup({ valuesCase });

      await userEvent.click(
        screen.getByTestId("parameter-value-widget-target"),
      );

      expect(await screen.findByTestId(component)).toBeInTheDocument();
      COMPONENTS.filter((other) => other !== component).forEach((other) => {
        expect(screen.queryByTestId(other)).not.toBeInTheDocument();
      });
    },
  );
});
