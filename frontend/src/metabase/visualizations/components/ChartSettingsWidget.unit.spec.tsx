import type { WidgetMount } from "custom-viz";
import type { ComponentProps } from "react";

import { renderWithProviders } from "__support__/ui";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import type { CustomVizSettingWidgetProps } from "metabase/viz-core";

import ChartSettingsWidget from "./ChartSettingsWidget";

type Props = ComponentProps<typeof ChartSettingsWidget> & {
  question: object;
  onChangeSeriesColor: () => void;
  onShowWidget: () => void;
};

interface SetupOpts {
  props: Props;
}

const { isWidgetMount, CustomVizSettingWidget } = PLUGIN_CUSTOM_VIZ;

const setup = ({ props }: SetupOpts) => {
  let mountedProps: CustomVizSettingWidgetProps | undefined;
  function RecordingWidget({
    widgetProps,
  }: {
    widgetProps: CustomVizSettingWidgetProps;
  }) {
    mountedProps = widgetProps;
    return null;
  }
  PLUGIN_CUSTOM_VIZ.isWidgetMount = (
    value,
  ): value is WidgetMount<CustomVizSettingWidgetProps> =>
    typeof value === "function";

  PLUGIN_CUSTOM_VIZ.CustomVizSettingWidget = RecordingWidget;

  renderWithProviders(<ChartSettingsWidget {...props} />);

  return { mountedProps };
};

describe("ChartSettingsWidget", () => {
  afterEach(() => {
    PLUGIN_CUSTOM_VIZ.isWidgetMount = isWidgetMount;
    PLUGIN_CUSTOM_VIZ.CustomVizSettingWidget = CustomVizSettingWidget;
  });

  it("hands a custom viz widget only its documented props", () => {
    const mount: WidgetMount = () => ({
      update: () => undefined,
      unmount: () => undefined,
    });
    const onChange = jest.fn();
    const onChangeSettings = jest.fn();
    const { mountedProps } = setup({
      props: {
        id: "threshold",
        question: {},
        props: { placeholder: "Set threshold" },
        title: "Threshold",
        value: 1,
        widget: mount,
        onChange,
        onChangeSettings,
        onChangeSeriesColor: jest.fn(),
        onShowWidget: jest.fn(),
      },
    });

    expect(mountedProps).toEqual({
      id: "threshold",
      placeholder: "Set threshold",
      value: 1,
      onChange,
      onChangeSettings,
    });
  });
});
