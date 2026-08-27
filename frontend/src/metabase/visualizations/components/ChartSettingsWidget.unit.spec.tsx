import type { WidgetMount } from "custom-viz";
import type { ComponentProps } from "react";

import { renderWithProviders } from "__support__/ui";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";

import ChartSettingsWidget from "./ChartSettingsWidget";

const { isWidgetMount, CustomVizSettingWidget } = PLUGIN_CUSTOM_VIZ;

describe("ChartSettingsWidget", () => {
  afterEach(() => {
    PLUGIN_CUSTOM_VIZ.isWidgetMount = isWidgetMount;
    PLUGIN_CUSTOM_VIZ.CustomVizSettingWidget = CustomVizSettingWidget;
  });

  it("hands a custom viz widget only its documented props", () => {
    let mountedProps: Record<string, unknown> | undefined;
    function RecordingWidget({
      widgetProps,
    }: {
      widgetProps: Record<string, unknown>;
    }) {
      mountedProps = widgetProps;
      return null;
    }
    PLUGIN_CUSTOM_VIZ.isWidgetMount = (value): value is WidgetMount =>
      typeof value === "function";
    PLUGIN_CUSTOM_VIZ.CustomVizSettingWidget = RecordingWidget;
    const mount: WidgetMount = () => ({
      update: () => undefined,
      unmount: () => undefined,
    });
    const onChange = jest.fn();
    const onChangeSettings = jest.fn();
    const props: ComponentProps<typeof ChartSettingsWidget> & {
      question: object;
      onShowWidget: () => void;
      onChangeSeriesColor: () => void;
    } = {
      id: "threshold",
      title: "Threshold",
      value: 1,
      widget: mount,
      props: { placeholder: "Set threshold" },
      onChange,
      onChangeSettings,
      question: {},
      onShowWidget: jest.fn(),
      onChangeSeriesColor: jest.fn(),
    };

    renderWithProviders(<ChartSettingsWidget {...props} />);

    expect(mountedProps).toEqual({
      id: "threshold",
      value: 1,
      onChange,
      onChangeSettings,
      placeholder: "Set threshold",
    });
  });
});
