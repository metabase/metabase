import { useMemo } from "react";
import { t } from "ttag";
import { Tooltip } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type * as Lib from "metabase-lib";
import { getFilterItems } from "../utils";
import { FilterButton } from "./FilterBarButton.styled";

interface FilterBarButtonProps {
  query: Lib.Query;
  isExpanded: boolean;
  onClick: () => void;
}

export function FilterBarButton({
  query,
  isExpanded,
  onClick,
}: FilterBarButtonProps) {
  const items = useMemo(() => getFilterItems(query), [query]);

  return (
    <Tooltip label={isExpanded ? t`Hide filters` : t`Show filters`}>
      <FilterButton
        leftIcon={<Icon name="filter" />}
        radius="xl"
        isExpanded={isExpanded}
        data-testid="filters-visibility-control"
        onClick={onClick}
      >
        {items.length}
      </FilterButton>
    </Tooltip>
  );
}
