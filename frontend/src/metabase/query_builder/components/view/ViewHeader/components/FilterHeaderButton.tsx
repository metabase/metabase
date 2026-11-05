import { useMemo } from "react";
import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Badge, Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface FilterHeaderButtonProps {
  question: Question;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onAddFilter: () => void;
}

export function FilterHeaderButton({
  question,
  isExpanded,
  onExpand,
  onCollapse,
  onAddFilter,
}: FilterHeaderButtonProps) {
  const query = question.query();
  const items = useMemo(() => (query ? getFilterItems(query) : []), [query]);
  const hasFilters = items.length > 0;
  const label = getButtonLabel(hasFilters, isExpanded);

  useRegisterShortcut([
    {
      id: "query-builder-visualization-open-filter",
      perform: onAddFilter,
    },
  ]);

  return (
    <Button
      classNames={{
        root: ViewTitleHeaderS.ActionButtonRoot,
        label: ViewTitleHeaderS.ActionButtonLabel,
        section: ViewTitleHeaderS.ActionButtonSection,
      }}
      leftSection={<Icon name="filter" />}
      rightSection={
        hasFilters && (
          <Badge
            size="xs"
            variant="filled"
            color="neutral"
            bg={isExpanded ? "core-filter-strong" : undefined}
            c={isExpanded ? "text-primary-inverse" : undefined}
            style={{ cursor: "inherit" }}
          >
            {items.length}
          </Badge>
        )
      }
      // With no filters there is nothing to show: the click opens the bar
      // with its caret, as the shortcut does.
      onClick={!hasFilters ? onAddFilter : isExpanded ? onCollapse : onExpand}
      aria-expanded={isExpanded}
      data-testid="question-filter-header"
    >
      {label}
    </Button>
  );
}

/**
 * Prototype: the button says what a click does. With no filters it adds one;
 * with filters it shows or hides the filter bar.
 */
function getButtonLabel(hasFilters: boolean, isExpanded: boolean) {
  if (!hasFilters) {
    return t`Filter`;
  }
  return isExpanded ? t`Hide filters` : t`Show filters`;
}

interface RenderCheckOpts {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  isObjectDetail: boolean;
  isActionListVisible: boolean;
}

FilterHeaderButton.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
  isActionListVisible,
}: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !isObjectDetail &&
    isActionListVisible &&
    !question.isArchived()
  );
};
