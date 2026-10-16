import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { ActionIcon, Button, Group, Icon, Menu } from "metabase/ui";

import type { CommonSettings } from "../analyses/types";
import { hasPanelSettings } from "../components/SettingsPanel";
import { SqlModal } from "../components/SqlModal";
import { ToolbarSetting } from "../components/toolbar/ToolbarSetting";
import type { SettingKey, SettingWidget } from "../settings/types";

import type { AnalysisPanelTab } from "./AnalysisDocumentContext";

const findSetting = (
  widgets: SettingWidget[],
  id: SettingKey<CommonSettings>,
): SettingWidget | undefined => widgets.find((widget) => widget.id === id);

type AnalysisCardToolbarProps = {
  widgets: SettingWidget[];
  setupLabel: string;
  sql: string | null;
  hasInsights: boolean;
  panelTab: AnalysisPanelTab | null;
  onPanelTabChange: (panelTab: AnalysisPanelTab | null) => void;
  onDone: () => void;
};

/**
 * The analysis card's header in edit mode. The document header holds the
 * table and date range, and the side panel holds the rest of the settings.
 */
export const AnalysisCardToolbar = ({
  widgets,
  setupLabel,
  sql,
  hasInsights,
  panelTab,
  onPanelTabChange,
  onDone,
}: AnalysisCardToolbarProps) => {
  const [sendToast] = useToast();
  const [isSqlOpened, { open: openSql, close: closeSql }] = useDisclosure();
  const togglePanelTab = (target: AnalysisPanelTab) =>
    onPanelTabChange(panelTab === target ? null : target);

  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap">
          <Button.Group>
            <Button
              variant="default"
              aria-pressed={panelTab === "setup"}
              onClick={() => togglePanelTab("setup")}
            >
              {setupLabel}
            </Button>
            {hasPanelSettings(widgets, "advanced") && (
              <Button
                variant="default"
                aria-label={t`Advanced settings`}
                aria-pressed={panelTab === "advanced"}
                leftSection={<Icon name="sliders" />}
                onClick={() => togglePanelTab("advanced")}
              />
            )}
          </Button.Group>
          <ToolbarSetting setting={findSetting(widgets, "counting")} />
          <ToolbarSetting setting={findSetting(widgets, "granularity")} />
        </Group>
        <Group gap="sm" wrap="nowrap">
          {hasInsights && (
            <Button
              variant="default"
              aria-pressed={panelTab === "insights"}
              leftSection={<Icon name="insight" />}
              onClick={() => togglePanelTab("insights")}
            >
              {t`Insights`}
            </Button>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label={t`More options`}
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="filter" />}
                onClick={() =>
                  sendToast({ message: t`Coming soon`, timeout: 3000 })
                }
              >
                {t`Filter`}
              </Menu.Item>
              <Menu.Item leftSection={<Icon name="sql" />} onClick={openSql}>
                {t`View the SQL`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Button variant="filled" onClick={onDone}>
            {t`Done`}
          </Button>
        </Group>
      </Group>
      <SqlModal sql={sql} opened={isSqlOpened} onClose={closeSql} />
    </>
  );
};
