import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionIcon, Badge, Button, Group, Icon, Tooltip } from "metabase/ui";
import type { ConcreteTableId } from "metabase-types/api";

import type { CommonSettings } from "../analyses/types";
import type { SettingKey, SettingWidget } from "../settings/types";

import { SqlModal } from "./SqlModal";
import { TableSegmentsButton } from "./toolbar/TableSegmentsButton";
import { ToolbarSetting } from "./toolbar/ToolbarSetting";

const findSetting = (
  widgets: SettingWidget[],
  id: SettingKey<CommonSettings>,
): SettingWidget | undefined => widgets.find((widget) => widget.id === id);

type AnalysisToolbarProps = {
  widgets: SettingWidget[];
  tableId: ConcreteTableId | undefined;
  tableName: string | undefined;
  /** Absent when the table is fixed, as it is for a saved analysis. */
  onTableChange?: (tableId: ConcreteTableId) => void;
  isSegmentsOpen: boolean;
  onToggleSegments: () => void;
  setupLabel: string;
  sql: string | null;
  canSave: boolean;
  isSaveDisabled: boolean;
  isSetupOpen: boolean;
  onToggleSetup: () => void;
  /** The number of filter pills, shown as a badge on the Filters button. */
  filterCount: number;
  areFiltersExpanded: boolean;
  onToggleFilters: () => void;
  /** The setup button is hovered, so the setup panel can show it's the one. */
  onHintSetup: (isHinted: boolean) => void;
  onSave: () => void;
};

/**
 * The layout is fixed here. Settings only supply each control's value,
 * visibility and options.
 */
export const AnalysisToolbar = ({
  widgets,
  tableId,
  tableName,
  onTableChange,
  isSegmentsOpen,
  onToggleSegments,
  setupLabel,
  sql,
  canSave,
  isSaveDisabled,
  isSetupOpen,
  onToggleSetup,
  filterCount,
  areFiltersExpanded,
  onToggleFilters,
  onHintSetup,
  onSave,
}: AnalysisToolbarProps) => {
  const [sqlOpened, { open: openSql, close: closeSql }] = useDisclosure();
  const filtersSetting = findSetting(widgets, "filters");
  const hasTable = tableId !== undefined;

  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Group gap="sm">
          <TableSegmentsButton
            tableId={tableId}
            tableName={tableName}
            onTableChange={onTableChange}
            isSegmentsOpen={isSegmentsOpen}
            onToggleSegments={onToggleSegments}
          />
          <Button
            variant="default"
            leftSection={<Icon name="sliders" />}
            aria-pressed={isSetupOpen}
            disabled={!hasTable}
            onClick={onToggleSetup}
            onMouseEnter={() => onHintSetup(true)}
            onMouseLeave={() => onHintSetup(false)}
          >
            {setupLabel}
          </Button>
          <Button.Group>
            <ToolbarSetting setting={findSetting(widgets, "counting")} />
            {/* PROTOTYPE: not wired up yet. */}
            <Tooltip label={t`Break out`}>
              <Button
                variant="default"
                px="sm"
                aria-label={t`Break out`}
                disabled={!hasTable}
              >
                <Icon name="split_branch" />
              </Button>
            </Tooltip>
            {filtersSetting !== undefined && !filtersSetting.hidden && (
              <Tooltip label={t`Filters`}>
                <Button
                  variant="default"
                  px="sm"
                  rightSection={
                    filterCount > 0 && (
                      <Badge
                        size="xs"
                        variant="filled"
                        color="neutral"
                        bg={
                          areFiltersExpanded ? "core-filter-strong" : undefined
                        }
                        c={
                          areFiltersExpanded
                            ? "text-primary-inverse"
                            : undefined
                        }
                        style={{ cursor: "inherit" }}
                      >
                        {filterCount}
                      </Badge>
                    )
                  }
                  aria-label={t`Filters`}
                  aria-pressed={areFiltersExpanded}
                  disabled={!hasTable}
                  onClick={onToggleFilters}
                >
                  <Icon name="filter" />
                </Button>
              </Tooltip>
            )}
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
