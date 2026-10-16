import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionIcon, Button, Group, Icon, Tooltip } from "metabase/ui";

import type { CommonSettings } from "../analyses/types";
import type { SettingKey, SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

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
  isPaletteOpen: boolean;
  onTogglePalette: () => void;
  onPanelChange: (panel: AnalysisPanel | null) => void;
  onSave: () => void;
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
  isPaletteOpen,
  onTogglePalette,
  onPanelChange,
  onSave,
}: AnalysisToolbarProps) => {
  const [sqlOpened, { open: openSql, close: closeSql }] = useDisclosure();

  const togglePanel = (target: AnalysisPanel) =>
    onPanelChange(panel === target ? null : target);
  // Column role settings aren't shown, so some analyses have nothing here.
  const hasAdvancedSettings = widgets.some(
    (widget) =>
      widget.section === "advanced" &&
      !widget.hidden &&
      widget.group === undefined,
  );

  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Group gap="sm">
          <Tooltip label={isPaletteOpen ? t`Hide segments` : t`Show segments`}>
            <Button
              variant="default"
              aria-label={isPaletteOpen ? t`Hide segments` : t`Show segments`}
              aria-pressed={isPaletteOpen}
              leftSection={<Icon name="database" />}
              onClick={onTogglePalette}
            />
          </Tooltip>
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
            <ToolbarSetting setting={findSetting(widgets, "filters")} />
          </Button.Group>
        </Group>

        <Group gap="sm">
          <ToolbarSetting setting={findSetting(widgets, "date_range")} />
          <ToolbarSetting setting={findSetting(widgets, "granularity")} />
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
