import React from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import GroupSelect from "metabase/admin/people/components/GroupSelect";

import type { GroupIds } from "../types";

type LDAPMappingGroupSelectProps = {
  groups: any;
  selectedGroups: any;
  onGroupChange: () => void;
};

const LDAPMappingGroupSelect = ({
  groups,
  selectedGroups,
  onGroupChange,
}: LDAPMappingGroupSelectProps) =>
  groups ? (
    <GroupSelect
      groups={groups}
      selectedGroupIds={selectedGroups}
      onGroupChange={onGroupChange}
      emptyListMessage={t`No mappable groups`}
    />
  ) : (
    <LoadingSpinner />
  );

export default LDAPMappingGroupSelect;
