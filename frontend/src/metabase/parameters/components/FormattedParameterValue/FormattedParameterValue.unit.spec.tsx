import { renderWithProviders, screen } from "__support__/ui";
import type { State } from "metabase/redux/store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { setLocalization } from "metabase/utils/i18n";
import { createMockParameter } from "metabase-types/api/mocks";

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
  it("renders the raw value for a list source without connected fields (remapping is delegated to the field widget)", () => {
    setup({
      value: "A",
      parameter: createMockParameter({
        values_source_type: "static-list",
        values_source_config: {
          values: [["A", "Custom Label"], ["B"]],
        },
      }),
    });

    // Without connected fields the raw value is shown; the [value, label] pair
    // is resolved by ParameterFieldWidgetValue through the remapping endpoint.
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("Custom Label")).not.toBeInTheDocument();
  });

  it("should render the placeholder with truncation when there is no value", () => {
    setup({
      value: null as any,
      parameter: createMockParameter(),
      placeholder: "Filter this long column name",
    });

    const text = screen.getByText("Filter this long column name");
    expect(text).toBeInTheDocument();
    // Ellipsified renders a Mantine Text with truncate, which sets data-truncate
    expect(text).toHaveAttribute("data-truncate", "end");
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
