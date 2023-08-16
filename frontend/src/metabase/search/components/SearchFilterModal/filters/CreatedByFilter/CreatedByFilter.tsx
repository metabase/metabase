/* eslint-disable react/prop-types */
import { t } from "ttag";
import { useMemo } from "react";
import { SearchFilterComponent } from "metabase/search/types";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import { UserListResult } from "metabase-types/api";
import { CreatedByUserPicker } from "metabase/search/components/SearchFilterModal/filters/CreatedByFilter/CreatedByFilter.styled";

export const CreatedByFilter: SearchFilterComponent<"created_by"> = ({
  value = [],
  onChange,
}) => {
  const { data } = useUserListQuery();

  const onUserSelect = (users: UserListResult[]) => {
    if (users.length !== 0) {
      onChange([Number(users[0].id)]);
    } else {
      onChange([]);
    }
  };

  const selectedUser = useMemo(() => {
    if (data && value.length > 0) {
      const user = data.find(user => user.id === Number(value[0]));
      return user ? [user] : [];
    }
    return [];
  }, [data, value]);

  return (
    <div>
      {data && (
        <CreatedByUserPicker
          key={value.length && value[0]}
          canAddItems={value.length === 0}
          value={selectedUser}
          onChange={onUserSelect}
          users={data}
          placeholder={t`Anyone`}
        />
      )}
    </div>
  );
};
