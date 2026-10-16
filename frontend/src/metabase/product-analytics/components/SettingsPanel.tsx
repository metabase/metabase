import { Divider } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

import type { SettingSection, SettingWidget } from "../settings/types";

type PanelSection = Exclude<SettingSection, "toolbar">;

// ChartSettingsWidget insets itself for the chart settings sidebar; the
// surrounding panel already provides padding here.
const WIDGET_STYLE = { marginInline: 0 };

// Column role settings still pick their defaults from the table; they just
// aren't editable here.
const getPanelWidgets = (
  widgets: SettingWidget[],
  panel: PanelSection,
): SettingWidget[] =>
  widgets.filter(
    (widget) =>
      widget.section === panel && !widget.hidden && widget.group === undefined,
  );

/** Whether the panel would show anything. */
export const hasPanelSettings = (
  widgets: SettingWidget[],
  panel: PanelSection,
): boolean => getPanelWidgets(widgets, panel).length > 0;

type SettingsListProps = {
  panel: PanelSection;
  widgets: SettingWidget[];
};

/** The settings in one section of the side panel. */
export const SettingsList = ({ panel, widgets }: SettingsListProps) => {
  const visible = getPanelWidgets(widgets, panel);
  const primary = visible.filter((widget) => !widget.secondary);
  const secondary = visible.filter((widget) => widget.secondary);

  return (
    <>
      {primary.map((widget) => (
        <ChartSettingsWidget key={widget.id} {...widget} style={WIDGET_STYLE} />
      ))}
      {secondary.length > 0 && <Divider mb="xl" />}
      {secondary.map((widget) => (
        <ChartSettingsWidget key={widget.id} {...widget} style={WIDGET_STYLE} />
      ))}
    </>
  );
};
