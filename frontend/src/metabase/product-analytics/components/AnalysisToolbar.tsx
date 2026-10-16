import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { ActionIcon, Button, Group, Icon } from "metabase/ui";

import type { CommonSettings } from "../analyses/types";
import type { SettingKey, SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

import { hasPanelSettings } from "./SettingsPanel";
import { SqlModal } from "./SqlModal";
import { ToolbarSetting } from "./toolbar/ToolbarSetting";

const findSetting = (
  widgets: SettingWidget[],
  id: SettingKey<CommonSettings>,
): SettingWidget | undefined => widgets.find((widget) => widget.id === id);

type AnalysisToolbarProps = {
  widgets: SettingWidget[];
  panel: AnalysisPanel | null;
  setupLabel: string;
  sql: string | null;
  canSave: boolean;
  isSaveDisabled: boolean;
  /** Undefined when the analysis has no insights. */
  isInsightsOpen?: boolean;
  onPanelChange: (panel: AnalysisPanel | null) => void;
  onSave: () => void;
  onToggleInsights?: () => void;
};

/**
 * The layout is fixed here. Settings only supply each control's value,
 * visibility and options.
 */
export const AnalysisToolbar = ({
  widgets,
  panel,
  setupLabel,
  sql,
  canSave,
  isSaveDisabled,
  isInsightsOpen,
  onPanelChange,
  onSave,
  onToggleInsights,
}: AnalysisToolbarProps) => {
  const [sendToast] = useToast();
  const [sqlOpened, { open: openSql, close: closeSql }] = useDisclosure();

  const togglePanel = (target: AnalysisPanel) =>
    onPanelChange(panel === target ? null : target);
  // Column role settings aren't shown, so some analyses have nothing here.
  const hasAdvancedSettings = hasPanelSettings(widgets, "advanced");

  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Group gap="sm">
          <Button.Group>
            <Button
              variant="default"
              aria-pressed={panel === "setup"}
              onClick={() => togglePanel("setup")}
            >
              {setupLabel}
            </Button>
            {hasAdvancedSettings && (
              <Button
                variant="default"
                aria-label={t`Advanced settings`}
                aria-pressed={panel === "advanced"}
                leftSection={<Icon name="sliders" />}
                onClick={() => togglePanel("advanced")}
              />
            )}
          </Button.Group>
          <Button.Group>
            <ToolbarSetting setting={findSetting(widgets, "counting")} />
            <Button
              variant="default"
              leftSection={<Icon name="filter" />}
              onClick={() =>
                sendToast({ message: t`Coming soon`, timeout: 3000 })
              }
            >
              {t`Filter`}
            </Button>
          </Button.Group>
        </Group>

        <Group gap="sm">
          <ToolbarSetting setting={findSetting(widgets, "date_range")} />
          <ToolbarSetting setting={findSetting(widgets, "granularity")} />
          {onToggleInsights && (
            <Button
              variant="default"
              aria-pressed={isInsightsOpen}
              leftSection={<Icon name="insight" />}
              onClick={onToggleInsights}
            >
              {t`Insights`}
            </Button>
          )}
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label={t`View the SQL`}
            onClick={openSql}
          >
            <Icon name="sql" />
          </ActionIcon>
          {canSave && (
            <Button variant="subtle" disabled={isSaveDisabled} onClick={onSave}>
              {t`Save`}
            </Button>
          )}
        </Group>
      </Group>
      <SqlModal sql={sql} opened={sqlOpened} onClose={closeSql} />
    </>
  );
};
