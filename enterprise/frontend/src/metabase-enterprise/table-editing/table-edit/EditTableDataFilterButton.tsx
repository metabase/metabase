import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import { Button, Icon, Popover, Tooltip } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "./EditTableDataFilterButton.module.css";

interface EditTableDataFilterButtonProps {
  className?: string;
  question: Question;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onQuestionChange: (newQuestion: Question) => void;
}

// copied from metabase/query_builder/components/view/ViewHeader/components/FilterHeaderButton.tsx
export function EditTableDataFilterButton({
  className,
  question,
  isExpanded,
  onExpand,
  onCollapse,
  onQuestionChange,
}: EditTableDataFilterButtonProps) {
  const [isOpened, { close, toggle }] = useDisclosure();
  const query = question.query();
  const items = useMemo(() => (query ? getFilterItems(query) : []), [query]);
  const hasFilters = items.length > 0;
  const label = isExpanded ? t`Hide filters` : t`Show filters`;

  const handleQueryChange = (newQuery: Lib.Query) => {
    const newQuestion = question.setQuery(newQuery);
    onQuestionChange(newQuestion);
  };

  return (
    <Button.Group>
      <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
        <Popover.Target>
          <Button
            className={cx(className, ViewTitleHeaderS.FilterButton)}
            leftSection={<Icon name={hasFilters ? "filter_plus" : "filter"} />}
            onClick={toggle}
            data-testid="table-edit-filter-header"
          >
            {t`Filter`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <MultiStageFilterPicker
            query={query}
            canAppendStage={false}
            onChange={handleQueryChange}
            onClose={close}
          />
        </Popover.Dropdown>
      </Popover>
      {hasFilters && (
        <Tooltip label={label}>
          <Button
            aria-label={label}
            className={ViewTitleHeaderS.FilterButtonAttachment}
            onClick={isExpanded ? onCollapse : onExpand}
            data-testid="filters-visibility-control"
            data-expanded={isExpanded}
            style={{ borderLeft: "none" }} // mantine puts a double border between buttons in groups
          >
            <div className={ViewTitleHeaderS.FilterCountChip}>
              {items?.length}
            </div>
          </Button>
        </Tooltip>
      )}
    </Button.Group>
  );
}
