import { renderWithProviders, screen } from "__support__/ui";
import { setLocalization } from "metabase/lib/i18n";
import { createMockParameter } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import FormattedParameterValue, {
  type FormattedParameterValueProps,
} from "./FormattedParameterValue";

type SetupOpts = FormattedParameterValueProps;

function setup({
  parameter,
  value,
  placeholder,
  storeInitialState,
}: SetupOpts & {
  storeInitialState?: Partial<State>;
}) {
  return renderWithProviders(
    <FormattedParameterValue
      parameter={parameter}
      value={value}
      placeholder={placeholder}
    />,
    {
      storeInitialState,
    },
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

  it("should translate boolean filter value", () => {
    setLocalization({
      headers: {
        language: "fr",
        "plural-forms": "nplurals=2; plural=(n != 1);",
      },
      translations: {
        "": {
          True: {
            msgstr: ["Vrai"],
          },
          False: {
            msgstr: ["Faux"],
          },
        },
      },
    });

    setup({
      value: [false],
      parameter: createMockParameter({
        name: "Boolean",
        slug: "boolean",
        type: "boolean/=",
      }),
      storeInitialState: createMockState({
        settings: createMockSettingsState({ "site-locale": "fr" }),
      }),
    });

    expect(screen.getByText("Faux")).toBeInTheDocument();
  });
});
