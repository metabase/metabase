/* eslint-disable react/prop-types */
import { t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { Text } from "metabase/ui";
import { CreatedByFilter } from "metabase/search/components/filters/CreatedByFilter/CreatedByFilter";

export const CreatedByDisplay: SearchSidebarFilterComponent<"created_by">["DisplayComponent"] =
  ({ value }) => {
    const { data: users = [], isLoading } = useUserListQuery();

    const user = value && users.find(user => user.id === value);

    const getDisplayValue = () => {
      if (isLoading) {
        return t`Loading…`;
      }

      if (!value) {
        return CreatedByFilter.title;
      }

      return user ? user.common_name : t`1 user selected`;
    };

    return (
      <Text c="inherit" weight={700} truncate>
        {getDisplayValue()}
      </Text>
    );
  };
