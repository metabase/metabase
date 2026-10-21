import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";

import type { CommonSettings } from "../analyses/types";
import { ToolbarSetting } from "../components/toolbar/ToolbarSetting";
import type { SettingKey, SettingWidget } from "../settings/types";

import type { AnalysisPanelTab } from "./AnalysisDocumentContext";
import { AnalysisTitleButton } from "./AnalysisTitleButton";

const findSetting = (
  widgets: SettingWidget[],
  id: SettingKey<CommonSettings>,
): SettingWidget | undefined => widgets.find((widget) => widget.id === id);

type AnalysisCardToolbarProps = {
  title: string;
  onTitleClick: () => void;
  widgets: SettingWidget[];
  /** Whether the card shows a chart that insights can explain. */
  hasInsights: boolean;
  panelTab: AnalysisPanelTab | null;
  onPanelTabChange: (panelTab: AnalysisPanelTab | null) => void;
};

/**
 * The analysis card's header in edit mode: its date range and time grain at
 * the top right. The side panel holds the rest of the settings.
 */
export const AnalysisCardToolbar = ({
  title,
  onTitleClick,
  widgets,
  hasInsights,
  panelTab,
  onPanelTabChange,
}: AnalysisCardToolbarProps) => (
  <Group justify="space-between" wrap="nowrap" gap="sm">
    <AnalysisTitleButton title={title} onClick={onTitleClick} />
    <Group gap="sm" wrap="nowrap">
      {hasInsights && (
        <Button
          variant="default"
          aria-pressed={panelTab === "insights"}
          leftSection={<Icon name="insight" />}
          onClick={() =>
            onPanelTabChange(panelTab === "insights" ? null : "insights")
          }
        >
          {t`Insights`}
        </Button>
      )}
      <ToolbarSetting setting={findSetting(widgets, "date_range")} />
      <ToolbarSetting setting={findSetting(widgets, "granularity")} />
    </Group>
  </Group>
);
