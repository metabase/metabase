import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionIcon, Badge, Button, Group, Icon, Tooltip } from "metabase/ui";

import type { CommonSettings } from "../analyses/types";
import type { SettingKey, SettingWidget } from "../settings/types";
import type { HintedPanel } from "../use-analysis-state";

import { SqlModal } from "./SqlModal";
import { ToolbarSetting } from "./toolbar/ToolbarSetting";

const findSetting = (
  widgets: SettingWidget[],
  id: SettingKey<CommonSettings>,
): SettingWidget | undefined => widgets.find((widget) => widget.id === id);

type AnalysisToolbarProps = {
  widgets: SettingWidget[];
  setupLabel: string;
  sql: string | null;
  canSave: boolean;
  isSaveDisabled: boolean;
  isSetupOpen: boolean;
  onToggleSetup: () => void;
  /** The number of filter pills, shown as a badge that shows and hides them. */
  filterCount: number;
  areFiltersExpanded: boolean;
  onToggleFilters: () => void;
  /** The panel whose button is hovered, so the panel can show it's the one. */
  onHintPanel: (panel: HintedPanel | null) => void;
  onSave: () => void;
};

/**
 * The layout is fixed here. Settings only supply each control's value,
 * visibility and options.
 */
export const AnalysisToolbar = ({
  widgets,
  setupLabel,
  sql,
  canSave,
  isSaveDisabled,
  isSetupOpen,
  onToggleSetup,
  filterCount,
  areFiltersExpanded,
  onToggleFilters,
  onHintPanel,
  onSave,
}: AnalysisToolbarProps) => {
  const [sqlOpened, { open: openSql, close: closeSql }] = useDisclosure();
  const filtersSetting = findSetting(widgets, "filters");
  const filtersLabel = areFiltersExpanded ? t`Hide filters` : t`Show filters`;

  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Group gap="sm">
          <Button
            variant="default"
            aria-pressed={isSetupOpen}
            onClick={onToggleSetup}
            onMouseEnter={() => onHintPanel("setup")}
            onMouseLeave={() => onHintPanel(null)}
          >
            {setupLabel}
          </Button>
          <ToolbarSetting setting={findSetting(widgets, "counting")} />
          <Button.Group>
            <ToolbarSetting setting={filtersSetting} />
            {filtersSetting !== undefined &&
              !filtersSetting.hidden &&
              filterCount > 0 && (
                <Tooltip label={filtersLabel}>
                  <Button
                    variant="default"
                    aria-label={filtersLabel}
                    aria-expanded={areFiltersExpanded}
                    onClick={onToggleFilters}
                  >
                    <Badge
                      size="xs"
                      variant="filled"
                      color="neutral"
                      bg={areFiltersExpanded ? "core-filter-strong" : undefined}
                      c={
                        areFiltersExpanded ? "text-primary-inverse" : undefined
                      }
                      style={{ cursor: "inherit" }}
                    >
                      {filterCount}
                    </Badge>
                  </Button>
                </Tooltip>
              )}
          </Button.Group>
        </Group>

        <Group gap="sm">
          <ToolbarSetting setting={findSetting(widgets, "breakout")} />
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
