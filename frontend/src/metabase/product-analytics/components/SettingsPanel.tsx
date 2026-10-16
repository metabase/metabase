import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Divider, Paper } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

import type { SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

// ChartSettingsWidget insets itself for the chart settings sidebar; the
// surrounding panel already provides padding here.
const WIDGET_STYLE = { marginInline: 0 };

// Column role settings still pick their defaults from the table; they just
// aren't editable here.
const getPanelWidgets = (
  widgets: SettingWidget[],
  panel: AnalysisPanel,
): SettingWidget[] =>
  widgets.filter(
    (widget) =>
      widget.section === panel && !widget.hidden && widget.group === undefined,
  );

/** Whether the panel would show anything. */
export const hasPanelSettings = (
  widgets: SettingWidget[],
  panel: AnalysisPanel,
): boolean => getPanelWidgets(widgets, panel).length > 0;

type SettingsPanelProps = {
  panel: AnalysisPanel;
  widgets: SettingWidget[];
};

export const SettingsPanel = ({ panel, widgets }: SettingsPanelProps) => (
  <Paper
    withBorder
    pt="xl"
    px="xl"
    w="25rem"
    mah="100%"
    className={cx(CS.alignSelfStart, CS.overflowYAuto)}
  >
    <SettingsList panel={panel} widgets={widgets} />
  </Paper>
);

/** The panel's settings without its frame. */
export const SettingsList = ({ panel, widgets }: SettingsPanelProps) => {
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
