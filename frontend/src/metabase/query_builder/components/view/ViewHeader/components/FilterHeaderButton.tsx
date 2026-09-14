import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import type { FilterChangeOpts } from "metabase/querying/filters/components/FilterPicker/types";
import { useDispatch } from "metabase/redux";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Badge, Button, Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { updateQuestion } from "../../../../actions";
import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface FilterHeaderButtonProps {
  question: Question;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

export function FilterHeaderButton({
  question,
  isExpanded,
  onExpand,
  onCollapse,
}: FilterHeaderButtonProps) {
  const dispatch = useDispatch();
  const [isOpened, { close, toggle }] = useDisclosure();
  const query = question.query();
  const items = useMemo(() => (query ? getFilterItems(query) : []), [query]);
  const hasFilters = items.length > 0;
  const label = isExpanded ? t`Hide filters` : t`Show filters`;

  const handleQueryChange = (newQuery: Lib.Query, opts: FilterChangeOpts) => {
    const newQuestion = question.setQuery(newQuery);
    dispatch(
      updateQuestion(newQuestion, { run: opts.run, shouldUpdateUrl: true }),
    );
  };

  useRegisterShortcut([
    {
      id: "query-builder-visualization-open-filter",
      perform: toggle,
    },
  ]);

  return (
    <Button.Group>
      <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
        <Popover.Target>
          <Button
            className={ViewTitleHeaderS.FilterButton}
            classNames={{
              root: ViewTitleHeaderS.ActionButtonRoot,
              label: ViewTitleHeaderS.ActionButtonLabel,
              section: ViewTitleHeaderS.ActionButtonSection,
            }}
            leftSection={<Icon name={hasFilters ? "filter_plus" : "filter"} />}
            onClick={toggle}
            data-testid="question-filter-header"
          >
            {t`Filter`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <MultiStageFilterPicker
            query={query}
            canAppendStage={question.display() !== "pivot"}
            onChange={handleQueryChange}
            onClose={close}
          />
        </Popover.Dropdown>
      </Popover>
      {hasFilters && (
        <Tooltip label={label}>
          <Button
            aria-label={label}
            onClick={isExpanded ? onCollapse : onExpand}
            data-testid="filters-visibility-control"
            data-expanded={isExpanded}
          >
            <Badge
              size="xs"
              variant="filled"
              color="neutral"
              bg={isExpanded ? "core-filter-strong" : undefined}
              c={isExpanded ? "text-primary-inverse" : undefined}
            >
              {items.length}
            </Badge>
          </Button>
        </Tooltip>
      )}
    </Button.Group>
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
