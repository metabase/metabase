import { useMemo } from "react";
import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Badge, Button, Icon, Tooltip } from "metabase/ui";
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
  const label = isExpanded ? t`Hide filters` : t`Show filters`;

  useRegisterShortcut([
    {
      id: "query-builder-visualization-open-filter",
      perform: onAddFilter,
    },
  ]);

  return (
    <Tooltip label={label}>
      <Button
        classNames={{
          root: ViewTitleHeaderS.ActionButtonRoot,
          label: ViewTitleHeaderS.ActionButtonLabel,
          section: ViewTitleHeaderS.ActionButtonSection,
        }}
        leftSection={<Icon name={hasFilters ? "filter_plus" : "filter"} />}
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
        onClick={isExpanded ? onCollapse : onExpand}
        aria-expanded={isExpanded}
        data-testid="question-filter-header"
      >
        {t`Filter`}
      </Button>
    </Tooltip>
  );
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
