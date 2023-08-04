/* eslint-disable react/prop-types */
import { SearchFilterComponent } from "metabase/search/types";
import { SearchFilterView } from "metabase/search/components/SearchFilterModal/filters/SearchFilterView";
import UserPicker from "metabase/components/UserPicker";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { UserListResult } from "metabase-types/api";

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
        <UserPicker
          value={data.filter(user => value.includes(String(user.id)))}
          onChange={onUserSelect}
          users={data}
        />
      )}
    </SearchFilterView>
  );
};
