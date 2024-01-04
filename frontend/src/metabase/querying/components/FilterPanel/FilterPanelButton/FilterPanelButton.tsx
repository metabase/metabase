import { useMemo } from "react";
import { t } from "ttag";
import { Tooltip } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type * as Lib from "metabase-lib";
import { getFilterItems } from "../utils";
import { FilterButton } from "./FilterPanelButton.styled";

interface FilterPanelButtonProps {
  query: Lib.Query;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

export function FilterPanelButton({
  query,
  isExpanded,
  onExpand,
  onCollapse,
}: FilterPanelButtonProps) {
  const label = isExpanded ? t`Hide filters` : t`Show filters`;
  const items = useMemo(() => getFilterItems(query), [query]);

  return (
    <Tooltip label={label}>
      <FilterButton
        leftIcon={<Icon name="filter" />}
        radius="xl"
        isExpanded={isExpanded}
        aria-label={label}
        data-testid="filters-visibility-control"
        onClick={isExpanded ? onCollapse : onExpand}
      >
        {items.length}
      </FilterButton>
    </Tooltip>
  );
}
