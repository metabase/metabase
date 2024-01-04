import { useMemo } from "react";
import { t } from "ttag";
import { Button, Tooltip } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type * as Lib from "metabase-lib";
import { getFilterItems } from "../utils";

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
      <Button
        leftIcon={<Icon name="filter" />}
        data-testid="filters-visibility-control"
        onClick={onClick}
      >
        {items.length}
      </Button>
    </Tooltip>
  );
}
