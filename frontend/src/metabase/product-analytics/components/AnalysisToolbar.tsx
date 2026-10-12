import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { ActionIcon, Button, Group, Icon, SegmentedControl } from "metabase/ui";

import type { CommonSettings } from "../analyses/types";
import type { SettingKey, SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

import S from "./AnalysisToolbar.module.css";
import { SqlModal } from "./SqlModal";
import { ToolbarSetting } from "./toolbar/ToolbarSetting";

const findSetting = (
  widgets: SettingWidget[],
  id: SettingKey<CommonSettings>,
): SettingWidget | undefined => widgets.find((widget) => widget.id === id);

type AnalysisToolbarProps = {
  widgets: SettingWidget[];
  panel: AnalysisPanel;
  setupLabel: string;
  sql: string | null;
  canSave: boolean;
  onPanelChange: (panel: AnalysisPanel) => void;
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
  onPanelChange,
  onSave,
}: AnalysisToolbarProps) => {
  const [sendToast] = useToast();
  const [sqlOpened, { open: openSql, close: closeSql }] = useDisclosure();

  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Group gap="sm">
          <SegmentedControl<AnalysisPanel>
            classNames={{
              label: S.segmentedControlLabel,
            }}
            value={panel}
            onChange={onPanelChange}
            data={[
              { value: "setup", label: setupLabel },
              {
                value: "advanced",
                icon: "sliders",
                ariaLabel: t`Advanced settings`,
              },
            ]}
          />
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
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label={t`View the SQL`}
            onClick={openSql}
          >
            <Icon name="sql" />
          </ActionIcon>
          <Button variant="subtle" disabled={!canSave} onClick={onSave}>
            {t`Save`}
          </Button>
        </Group>
      </Group>
      <SqlModal sql={sql} opened={sqlOpened} onClose={closeSql} />
    </>
  );
};
