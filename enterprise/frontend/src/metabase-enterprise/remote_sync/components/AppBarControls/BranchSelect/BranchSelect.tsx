import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import { Icon, Loader, Select } from "metabase/ui";
import { useGetRemoteSyncBranchesQuery } from "metabase-enterprise/api";

type BranchSelectProps = {
  branch: string;
  onChange: (branch: string) => void;
};

export const BranchSelect = ({ branch, onChange }: BranchSelectProps) => {
  const [isOpened, setIsOpened] = useState(false);
  const { data, isFetching } = useGetRemoteSyncBranchesQuery(
    isOpened ? undefined : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const branches = _.uniq([branch, ...(data?.items ?? [])]);

  const handleChange = (value: string | null) => {
    if (value != null && value !== branch) {
      onChange(value);
    }
  };

  return (
    <Select
      aria-label={t`Branch`}
      data={branches}
      value={branch}
      searchable
      leftSection={<Icon name="git_branch" />}
      rightSection={isFetching ? <Loader size="xs" /> : undefined}
      w="12rem"
      onDropdownOpen={() => setIsOpened(true)}
      onDropdownClose={() => setIsOpened(false)}
      onChange={handleChange}
    />
  );
};
