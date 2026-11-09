import { t } from "ttag";

import type { RelativeIntervalDirection } from "metabase/querying/common/types";
import { StatusFilterWidget } from "metabase/transforms/components/StatusFilterWidget";
import { TimeFilterWidget } from "metabase/transforms/components/TimeFilterWidget";
import { Group } from "metabase/ui";
import type * as Urls from "metabase/urls";
import {
  DATA_TEST_RUN_STATUSES,
  type DataTestRunStatus,
} from "metabase-types/api";

import { formatDataTestRunStatus } from "../../../utils";

const PAST_INTERVAL_DIRECTIONS: RelativeIntervalDirection[] = [
  "past",
  "current",
];

type DataTestRunFilterOptions = Omit<Urls.TransformTestRunListParams, "page">;

type DataTestRunFilterBarProps = {
  filterOptions: DataTestRunFilterOptions;
  onFilterOptionsChange: (filterOptions: DataTestRunFilterOptions) => void;
};

export function DataTestRunFilterBar({
  filterOptions,
  onFilterOptionsChange,
}: DataTestRunFilterBarProps) {
  const statusOptions = DATA_TEST_RUN_STATUSES.map((status) => ({
    value: status,
    label: formatDataTestRunStatus(status),
  }));

  const handleStartTimeChange = (startTime: string | undefined) => {
    onFilterOptionsChange({ ...filterOptions, startTime });
  };

  const handleEndTimeChange = (endTime: string | undefined) => {
    onFilterOptionsChange({ ...filterOptions, endTime });
  };

  const handleStatusesChange = (statuses: DataTestRunStatus[]) => {
    onFilterOptionsChange({ ...filterOptions, statuses });
  };

  return (
    <Group>
      <TimeFilterWidget
        label={t`Started at`}
        value={filterOptions.startTime}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleStartTimeChange}
      />
      <TimeFilterWidget
        label={t`Ended at`}
        value={filterOptions.endTime}
        availableDirections={PAST_INTERVAL_DIRECTIONS}
        onChange={handleEndTimeChange}
      />
      <StatusFilterWidget
        label={t`Status`}
        statuses={filterOptions.statuses ?? []}
        options={statusOptions}
        onChange={handleStatusesChange}
      />
    </Group>
  );
}
