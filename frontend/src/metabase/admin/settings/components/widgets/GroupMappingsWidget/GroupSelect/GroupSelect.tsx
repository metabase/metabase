import React from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import GroupSelect from "metabase/admin/people/components/GroupSelect";

import type { GroupIds } from "../types";

type Props = {
  groups: GroupIds;
  selectedGroupIds: any;
  onGroupChange: () => void;
};

const GroupMappingsWidgetGroupSelect = ({
  groups,
  selectedGroupIds,
  onGroupChange,
}: Props) =>
  groups ? (
    <GroupSelect
      groups={groups}
      selectedGroupIds={selectedGroupIds}
      onGroupChange={onGroupChange}
      emptyListMessage={t`No mappable groups`}
    />
  ) : (
    <LoadingSpinner />
  );

export default GroupMappingsWidgetGroupSelect;
