import dayjs from "dayjs";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useGetTasksInfoQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import "metabase/utils/dayjs";
import {
  Anchor,
  Box,
  Button,
  Flex,
  MultiSelect,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { TaskScheduleFiring } from "metabase-types/api";

import {
  filterFirings,
  heatCellBackground,
  maxPerDayFromCells,
  uniqueJobKeyOptions,
} from "./jobScheduleUtils";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WEEKDAY_OFFSETS = [0, 1, 2, 3, 4, 5, 6];

function displayZoneId(reportTimezone: string | null): string {
  return reportTimezone || dayjs.tz.guess();
}

function weekRangeUtcIso(
  weekOffset: number,
  zone: string,
): { start: string; end: string } {
  const anchor = dayjs.tz(new Date(), zone).add(weekOffset, "week");
  const start = anchor.startOf("isoWeek");
  const end = start.add(1, "week");
  return {
    start: start.utc().toISOString(),
    end: end.utc().toISOString(),
  };
}

function buildHourlyCells(
  firings: TaskScheduleFiring[],
  weekStartUtc: dayjs.Dayjs,
  zone: string,
): TaskScheduleFiring[][][] {
  const cells: TaskScheduleFiring[][][] = HOURS.map(() =>
    WEEKDAY_OFFSETS.map(() => []),
  );
  const weekStartZ = weekStartUtc.tz(zone);
  const weekEndZ = weekStartZ.add(1, "week");

  for (const f of firings) {
    const local = dayjs.utc(f.at).tz(zone);
    if (!local.isBefore(weekEndZ) || local.isBefore(weekStartZ)) {
      continue;
    }
    const dayIdx = local.startOf("day").diff(weekStartZ.startOf("day"), "day");
    const hour = local.hour();
    if (dayIdx >= 0 && dayIdx < 7 && hour >= 0 && hour < 24) {
      cells[hour][dayIdx].push(f);
    }
  }
  return cells;
}

export function JobSchedulePage() {
  const dispatch = useDispatch();
  const reportTimezone = useSetting("report-timezone");
  const zone = displayZoneId(reportTimezone);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedJobKeys, setSelectedJobKeys] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");

  const { start, end } = useMemo(
    () => weekRangeUtcIso(weekOffset, zone),
    [weekOffset, zone],
  );

  const { data, error, isFetching } = useGetTasksInfoQuery({ start, end });

  const weekStartUtc = useMemo(() => {
    const anchor = dayjs.tz(new Date(), zone).add(weekOffset, "week");
    return anchor.startOf("isoWeek").utc();
  }, [weekOffset, zone]);

  const dayLabels = useMemo(() => {
    const weekStartLocal = weekStartUtc.tz(zone);
    return WEEKDAY_OFFSETS.map((d) =>
      weekStartLocal.add(d, "day").format("ddd LL"),
    );
  }, [weekStartUtc, zone]);

  const filteredFirings = useMemo(
    () => filterFirings(data?.firings ?? [], selectedJobKeys, searchText),
    [data?.firings, selectedJobKeys, searchText],
  );

  const cells = useMemo(
    () => buildHourlyCells(filteredFirings, weekStartUtc, zone),
    [filteredFirings, weekStartUtc, zone],
  );

  const maxPerDay = useMemo(() => maxPerDayFromCells(cells), [cells]);

  const jobFilterOptions = useMemo(
    () => uniqueJobKeyOptions(data?.firings ?? [], data?.jobs ?? null),
    [data?.firings, data?.jobs],
  );

  const peak = useMemo(() => {
    let max = 0;
    let maxH = 0;
    let maxD = 0;
    cells.forEach((row, h) =>
      row.forEach((c, d) => {
        if (c.length > max) {
          max = c.length;
          maxH = h;
          maxD = d;
        }
      }),
    );
    return max > 0 ? { count: max, hour: maxH, dayIdx: maxD } : null;
  }, [cells]);

  const onOpenJob = useCallback(
    (jobKey: string) => {
      dispatch(push(`${Urls.adminToolsJobs()}/${encodeURIComponent(jobKey)}`));
    },
    [dispatch],
  );

  const displayTzLabel = reportTimezone
    ? reportTimezone
    : `${t`Browser local`} (${dayjs.tz.guess()})`;

  return (
    <SettingsPageWrapper title={t`Scheduled jobs`}>
      <LoadingAndErrorWrapper loading={isFetching} error={error}>
        <Stack gap="lg">
          <SettingsSection>
            <Stack gap="sm">
              <Text size="sm" c="text-secondary">
                {t`Times shown in:`} {displayTzLabel}
              </Text>
              <Text size="sm" c="text-secondary">
                {t`Each cell is one hour. Click a count to see firings and open the Quartz job.`}
              </Text>
              <Text size="sm" c="text-secondary">
                {t`Cell color intensity is relative to that day’s busiest hour (not across the whole week).`}
              </Text>
              <Flex gap="sm" wrap="wrap">
                <Button
                  variant="default"
                  onClick={() => setWeekOffset((w) => w - 1)}
                >{t`Previous week`}</Button>
                <Button variant="default" onClick={() => setWeekOffset(0)}>
                  {t`This week`}
                </Button>
                <Button
                  variant="default"
                  onClick={() => setWeekOffset((w) => w + 1)}
                >{t`Next week`}</Button>
              </Flex>
            </Stack>
          </SettingsSection>

          <SettingsSection>
            <Stack gap="md">
              <MultiSelect
                data={jobFilterOptions}
                label={t`Filter by job`}
                description={t`Leave empty to include all jobs. Selection applies to the grid below.`}
                placeholder={t`All jobs`}
                searchable
                clearable
                value={selectedJobKeys}
                onChange={setSelectedJobKeys}
                comboboxProps={{ withinPortal: true }}
              />
              <TextInput
                label={t`Search job or description`}
                placeholder={t`Substring match`}
                value={searchText}
                onChange={(e) => setSearchText(e.currentTarget.value)}
              />
            </Stack>
          </SettingsSection>

          {data?.firings_meta &&
            (data.firings_meta.truncations.length > 0 ||
              data.firings_meta.global_cap_exhausted) && (
              <SettingsSection>
                <Stack gap="xs">
                  {data.firings_meta.global_cap_exhausted && (
                    <Text c="text-secondary" size="sm">
                      {t`Some firings were omitted because the global safety cap was reached.`}{" "}
                      ({data.firings_meta.max_firings_global})
                    </Text>
                  )}
                  {data.firings_meta.truncations.length > 0 && (
                    <Text c="text-secondary" size="sm">
                      {t`One or more triggers hit the per-trigger cap.`} (
                      {data.firings_meta.max_firings_per_trigger})
                    </Text>
                  )}
                </Stack>
              </SettingsSection>
            )}

          {peak && (
            <SettingsSection>
              <Text size="sm">
                {t`Peak scheduled firings in a single hour (after filters):`}{" "}
                {peak.count} ({dayLabels[peak.dayIdx]?.split(",")[0]}{" "}
                {String(peak.hour).padStart(2, "0")}:00)
              </Text>
            </SettingsSection>
          )}

          <SettingsSection>
            <ScrollArea.Autosize mah="70vh" type="scroll">
              <Box
                component="table"
                style={{ borderCollapse: "collapse", width: "100%" }}
              >
                <thead>
                  <tr>
                    <Box component="th" style={{ width: "4rem" }} />
                    {dayLabels.map((label) => (
                      <Box
                        component="th"
                        key={label}
                        style={{
                          textAlign: "left",
                          padding: "0.5rem",
                          borderBottom: "1px solid var(--mb-color-border)",
                          fontSize: "0.75rem",
                        }}
                      >
                        {label}
                      </Box>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((hour) => (
                    <tr key={hour}>
                      <Box
                        component="td"
                        style={{
                          padding: "0.25rem",
                          fontSize: "0.75rem",
                          color: "var(--mb-color-text-secondary)",
                          verticalAlign: "top",
                        }}
                      >
                        {String(hour).padStart(2, "0")}:00
                      </Box>
                      {WEEKDAY_OFFSETS.map((d) => {
                        const list = cells[hour][d];
                        const n = list.length;
                        const dayMax = maxPerDay[d] ?? 0;
                        const title = list
                          .slice(0, 12)
                          .map(
                            (f) =>
                              `${f.description || f.job_key} (${f.job_key})`,
                          )
                          .join("\n");
                        return (
                          <Box
                            component="td"
                            key={d}
                            style={{
                              border: "1px solid var(--mb-color-border)",
                              padding: "0.15rem",
                              minWidth: "4.5rem",
                              verticalAlign: "top",
                              backgroundColor: heatCellBackground(n, dayMax),
                            }}
                          >
                            {n === 0 ? null : (
                              <Popover position="bottom" withArrow shadow="md">
                                <Popover.Target>
                                  <Tooltip
                                    label={title || t`Scheduled firings`}
                                  >
                                    <Button
                                      variant="subtle"
                                      size="compact-xs"
                                      p={2}
                                      h="auto"
                                      style={{ minWidth: "100%" }}
                                    >
                                      <Text size="xs" fw={700}>
                                        {n}
                                      </Text>
                                    </Button>
                                  </Tooltip>
                                </Popover.Target>
                                <Popover.Dropdown maw={360}>
                                  <Stack gap="xs">
                                    <Title order={6}>
                                      {t`Firings`} ({n})
                                    </Title>
                                    <Stack gap={4}>
                                      {list.slice(0, 20).map((f) => (
                                        <Box key={`${f.at}-${f.trigger_key}`}>
                                          <Anchor
                                            size="sm"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              onOpenJob(f.job_key);
                                            }}
                                          >
                                            {f.description || f.job_key}
                                          </Anchor>
                                          <Text size="xs" c="text-secondary">
                                            {f.trigger_key}
                                            {f.timezone && f.timezone !== zone
                                              ? ` · ${t`Trigger TZ`}: ${f.timezone}`
                                              : ""}
                                          </Text>
                                          <Text size="xs" c="text-tertiary">
                                            {dayjs
                                              .utc(f.at)
                                              .tz(zone)
                                              .format("LLL")}
                                          </Text>
                                        </Box>
                                      ))}
                                      {list.length > 20 && (
                                        <Text size="xs" c="text-secondary">
                                          {t`Showing`} 20 {t`of`} {list.length}
                                        </Text>
                                      )}
                                    </Stack>
                                  </Stack>
                                </Popover.Dropdown>
                              </Popover>
                            )}
                          </Box>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </Box>
            </ScrollArea.Autosize>
          </SettingsSection>
        </Stack>
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
}
