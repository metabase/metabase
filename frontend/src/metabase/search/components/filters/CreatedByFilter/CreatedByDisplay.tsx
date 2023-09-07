/* eslint-disable react/prop-types */
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { Text } from "metabase/ui";

export const CreatedByDisplay: SearchSidebarFilterComponent<"created_by">["DisplayComponent"] =
  ({ value }) => {
    const { data: users = [], isLoading } = useUserListQuery();

    const user = value && users.find(user => String(user.id) === value[0]);

    return (
      <Text c="inherit" weight={700}>
        {!isLoading && user && user.common_name}
      </Text>
    );
  };
