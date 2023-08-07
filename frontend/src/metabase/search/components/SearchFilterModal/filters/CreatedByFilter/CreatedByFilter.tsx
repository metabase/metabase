/* eslint-disable react/prop-types */
import { t } from "ttag";
import { SearchFilterComponent } from "metabase/search/types";
import { SearchFilterView } from "metabase/search/components/SearchFilterModal/filters/SearchFilterView";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { UserListResult } from "metabase-types/api";
import { CreatedByUserPicker } from "metabase/search/components/SearchFilterModal/filters/CreatedByFilter/CreatedByFilter.styled";

export const CreatedByFilter: SearchFilterComponent<"created_by"> = ({
  value = [],
  onChange,
}) => {
  const { data, isLoading } = useUserListQuery();

  const onUserSelect = (users: UserListResult[]) => {
    onChange(users.map(user => String(user.id)));
  };
  return (
    <SearchFilterView title="Created by" isLoading={isLoading}>
      {data && (
        <CreatedByUserPicker
          canAddItems={value.length === 0}
          value={data.filter(user => value.includes(String(user.id)))}
          onChange={onUserSelect}
          users={data}
          placeholder={t`Anyone`}
        />
      )}
    </SearchFilterView>
  );
};
