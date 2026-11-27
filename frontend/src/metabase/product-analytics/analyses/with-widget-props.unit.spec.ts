import type { AnalysisSettingDefinitions } from "./types";
import {
  type AnalysisSettingWidgetProps,
  withWidgetProps,
} from "./with-widget-props";

type Settings = {
  label: string | null;
  count: number;
};

type LabelWidgetProps = AnalysisSettingWidgetProps<string | null> & {
  placeholder: string;
};

const LabelWidget = (_props: LabelWidgetProps) => null;

const COUNT_DEFINITION: AnalysisSettingDefinitions<Settings>["count"] = {
  getDefault: () => 1,
  isValid: () => true,
};

describe("withWidgetProps", () => {
  it("gives back the definition", () => {
    const definition = {
      getDefault: () => null,
      isValid: () => true,
      widget: LabelWidget,
      getProps: () => ({ placeholder: "Any label" }),
    };
    const definitions: AnalysisSettingDefinitions<Settings> = {
      label: withWidgetProps("label", definition),
      count: COUNT_DEFINITION,
    };

    expect(definitions.label).toBe(definition);
  });

  it("checks the widget against the setting and getProps", () => {
    const definitions: AnalysisSettingDefinitions<Settings> = {
      label: withWidgetProps("label", {
        getDefault: () => null,
        isValid: () => true,
        // @ts-expect-error getProps must give every prop the widget needs
        widget: LabelWidget,
        getProps: () => ({}),
      }),
      count: withWidgetProps("count", {
        getDefault: () => 1,
        isValid: () => true,
        // @ts-expect-error the widget must take the setting's value
        widget: LabelWidget,
        getProps: () => ({ placeholder: "Any label" }),
      }),
    };

    expect(Object.keys(definitions)).toEqual(["label", "count"]);
  });

  it("still needs a default and a check of stored values", () => {
    const definitions: AnalysisSettingDefinitions<Settings> = {
      // @ts-expect-error every setting needs a default
      label: withWidgetProps("label", {
        isValid: () => true,
        widget: LabelWidget,
        getProps: () => ({ placeholder: "Any label" }),
      }),
      count: COUNT_DEFINITION,
    };

    expect(Object.keys(definitions)).toEqual(["label", "count"]);
  });
});
