import { replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { Group } from "metabase/ui";
import { getRunListUrl } from "metabase-enterprise/transforms/urls";
import type { TransformExecutionStatus } from "metabase-types/api";

import type { RunListParams } from "../../../types";

import { StatusFilterWidget } from "./StatusFilterWidget";

type FilterListProps = {
  params: RunListParams;
};

export function FilterList({ params }: FilterListProps) {
  const dispatch = useDispatch();

  const handleStatusChange = (statuses: TransformExecutionStatus[]) => {
    dispatch(replace(getRunListUrl({ ...params, statuses })));
  };

  return (
    <Group>
      <StatusFilterWidget
        statuses={params.statuses ?? []}
        onChange={handleStatusChange}
      />
    </Group>
  );
}
