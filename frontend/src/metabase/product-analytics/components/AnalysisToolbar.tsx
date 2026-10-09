import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { DatePicker } from "metabase/querying/common/components/DatePicker";
import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Menu,
  Popover,
  SegmentedControl,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import type { AnalysisConfig } from "../analyses/config";
import type { Grain, Granularity } from "../spec/types";
import type { AnalysisPanel, AnalysisState } from "../use-analysis-state";

import { SqlModal } from "./SqlModal";

const grainLabel = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`counting people`;
    case "session":
      return t`counting sessions`;
    case "event":
      return t`counting events`;
  }
};

const isGranularity = (
  unit: TemporalUnit,
  units: Granularity[],
): unit is Granularity => units.some((item) => item === unit);

type AnalysisToolbarProps = {
  config: AnalysisConfig;
  state: AnalysisState;
  sql: string | null;
  onPanelChange: (panel: AnalysisPanel) => void;
  onGrainChange: (grain: Grain) => void;
  onDateFilterChange: (value: AnalysisState["dateFilter"]) => void;
  onSpecChange: (spec: AnalysisState["spec"]) => void;
};

export const AnalysisToolbar = ({
  config,
  state,
  sql,
  onPanelChange,
  onGrainChange,
  onDateFilterChange,
  onSpecChange,
}: AnalysisToolbarProps) => {
  const [sendToast] = useToast();
  const [sqlOpened, { open: openSql, close: closeSql }] = useDisclosure();
  const [dateOpened, { close: closeDate, open: openDate }] = useDisclosure();
  const [unitOpened, { close: closeUnit, open: openUnit }] = useDisclosure();

  const currentUnit = config.granularity?.get(state.spec);
  const unitItems =
    config.granularity?.units.map((unit) => ({
      value: unit,
      label: Lib.describeTemporalUnit(unit),
    })) ?? [];

  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Group gap="sm">
          <SegmentedControl<AnalysisPanel>
            value={state.panel}
            onChange={onPanelChange}
            data={[
              { value: "setup", label: config.setupLabel },
              {
                value: "advanced",
                icon: "gear",
                ariaLabel: t`Advanced settings`,
                withTooltip: true,
              },
            ]}
          />
          <Menu>
            <Menu.Target>
              <Button variant="default" leftSection={<Icon name="group" />}>
                {grainLabel(state.spec.grain)}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => onGrainChange("person")}>
                {t`People`}
              </Menu.Item>
              <Menu.Item onClick={() => onGrainChange("session")}>
                {t`Sessions`}
              </Menu.Item>
              <Menu.Item onClick={() => onGrainChange("event")}>
                {t`Events`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Button
            variant="default"
            leftSection={<Icon name="filter" />}
            onClick={() =>
              sendToast({ message: t`Coming soon`, timeout: 3000 })
            }
          >
            {t`Filter`}
          </Button>
        </Group>

        <Group gap="sm">
          <Popover
            opened={dateOpened}
            onChange={(opened) => (opened ? openDate() : closeDate())}
            position="bottom-end"
          >
            <Popover.Target>
              <Button variant="default" leftSection={<Icon name="calendar" />}>
                {getDateFilterDisplayName(state.dateFilter)}
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <DatePicker
                value={state.dateFilter}
                onChange={(value) => {
                  onDateFilterChange(value);
                  closeDate();
                }}
              />
            </Popover.Dropdown>
          </Popover>

          {config.granularity !== undefined && currentUnit !== undefined && (
            <Popover
              opened={unitOpened}
              onChange={(opened) => (opened ? openUnit() : closeUnit())}
              position="bottom-end"
            >
              <Popover.Target>
                <Button variant="default">
                  {t`by ${Lib.describeTemporalUnit(currentUnit).toLowerCase()}`}
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <TemporalUnitPicker
                  value={currentUnit}
                  availableItems={unitItems}
                  onChange={(unit) => {
                    if (
                      config.granularity &&
                      isGranularity(unit, config.granularity.units)
                    ) {
                      onSpecChange(config.granularity.set(state.spec, unit));
                      closeUnit();
                    }
                  }}
                />
              </Popover.Dropdown>
            </Popover>
          )}

          <ActionIcon
            variant="default"
            size="lg"
            aria-label={t`SQL`}
            onClick={openSql}
          >
            <Icon name="sql" />
          </ActionIcon>
          <Button
            variant="default"
            onClick={() =>
              sendToast({ message: t`Coming soon`, timeout: 3000 })
            }
          >
            {t`Save`}
          </Button>
        </Group>
      </Group>
      <SqlModal sql={sql} opened={sqlOpened} onClose={closeSql} />
    </>
  );
};
