/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { jt, t } from "ttag";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { Text } from "metabase/ui";
import { CreatedByFilter } from "metabase/search/components/filters/CreatedByFilter/CreatedByFilter";

export const CreatedByDisplay: SearchSidebarFilterComponent<"created_by">["DisplayComponent"] =
  ({ value }) => {
    const { data: users = [], isLoading } = useUserListQuery();

    const user = value && users.find(user => String(user.id) === value[0]);

    const displayValue = useMemo(() => {
      if (isLoading) {
        return t`Loading…`;
      }

      if (!value || value.length === 0) {
        return CreatedByFilter.title;
      }

      if (value.length > 1) {
        return jt`${value.length} users selected`;
      }

      return user ? user.common_name : t`1 user selected`;
    }, [isLoading, user, value]);

    return (
      <Text c="inherit" weight={700}>
        {displayValue}
      </Text>
    );
  };
