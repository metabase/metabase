import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Divider, Paper } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

import type { SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

import S from "./SettingsPanel.module.css";

// ChartSettingsWidget insets itself for the chart settings sidebar; the Paper
// already provides padding here.
const WIDGET_STYLE = { marginInline: 0 };

type SettingsPanelProps = {
  panel: AnalysisPanel;
  widgets: SettingWidget[];
  /** The toolbar button that closes this panel is hovered. */
  isHinted?: boolean;
};

export const SettingsPanel = ({
  panel,
  widgets,
  isHinted = false,
}: SettingsPanelProps) => {
  const visible = widgets.filter(
    (widget) => widget.section === panel && !widget.hidden,
  );
  // Column role settings still pick their defaults from the table; they just
  // aren't editable here.
  const ungrouped = visible.filter((widget) => widget.group === undefined);
  const primary = ungrouped.filter((widget) => !widget.secondary);
  const secondary = ungrouped.filter((widget) => widget.secondary);

  return (
    <Paper
      withBorder
      pt="xl"
      px="xl"
      w="25rem"
      mah="100%"
      className={cx(S.root, CS.alignSelfStart, CS.overflowYAuto)}
      data-hinted={isHinted}
    >
      {primary.map((widget) => (
        <ChartSettingsWidget key={widget.id} {...widget} style={WIDGET_STYLE} />
      ))}
      {secondary.length > 0 && <Divider mb="xl" />}
      {secondary.map((widget) => (
        <ChartSettingsWidget key={widget.id} {...widget} style={WIDGET_STYLE} />
      ))}
    </Paper>
  );
};
