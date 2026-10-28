import { useContext, useState } from "react";
import { t } from "ttag";

import { Badge, Button, Icon, Popover, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterTokenView } from "./ExpressionBar";
import S from "./ExpressionBar.module.css";
import {
  AddSummaryFilter,
  AddSummaryFilterDropdown,
  commitSummaryQuery,
  useSummaryFilters,
  useSummaryZonePlacement,
} from "./SummaryPills";
import { CompactReadingContext } from "./settings";

type SummaryMenuProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

/**
 * The filters on the summaries folded into a split button at the right of
 * the bar, shown only while the query summarizes, after the query builder's
 * Filter button: "Summary filters" adds one straight from the aggregations,
 * and the count beside it opens the existing ones as pills, one per line,
 * with a button to add another. Renders nothing while the stage has no summary.
 */
export function SummaryMenu({ query, stageIndex, onChange }: SummaryMenuProps) {
  const compactReading = useContext(CompactReadingContext);
  const { summaries, filters, columns } = useSummaryFilters(query, stageIndex);
  const zoneRef = useSummaryZonePlacement<HTMLDivElement>();
  const [isAddOpened, setIsAddOpened] = useState(false);
  const [isListOpened, setIsListOpened] = useState(false);

  if (summaries.length === 0) {
    return null;
  }

  const commit = (nextQuery: Lib.Query) =>
    commitSummaryQuery(nextQuery, onChange);

  return (
    <Button.Group ref={zoneRef} className={S.summaryZone}>
      <Popover
        opened={isAddOpened}
        position="bottom-end"
        transitionProps={{ duration: 0 }}
        onChange={setIsAddOpened}
      >
        <Popover.Target>
          <Button
            size="sm"
            leftSection={<Icon name="sum" />}
            onClick={() => setIsAddOpened((opened) => !opened)}
          >
            {t`Summary filters`}
          </Button>
        </Popover.Target>
        <AddSummaryFilterDropdown
          columns={columns}
          summaryCount={summaries.length}
          onAdd={({ summary }, filterable) => {
            commit(Lib.filter(summary.query, summary.stageIndex, filterable));
            setIsAddOpened(false);
          }}
        />
      </Popover>
      {filters.length > 0 && (
        <Popover
          opened={isListOpened}
          position="bottom-end"
          transitionProps={{ duration: 0 }}
          onChange={setIsListOpened}
        >
          <Popover.Target>
            <Button
              size="sm"
              aria-label={t`Show the filters on the summary`}
              onClick={() => setIsListOpened((opened) => !opened)}
            >
              <Badge
                size="xs"
                variant="filled"
                color="neutral"
                bg={isListOpened ? "core-summarize" : undefined}
                c={isListOpened ? "text-primary-inverse" : undefined}
                style={{ cursor: "inherit" }}
              >
                {filters.length}
              </Badge>
            </Button>
          </Popover.Target>
          <Popover.Dropdown p="sm" style={{ overflow: "visible" }}>
            <Stack gap="xs" align="flex-start" miw={240}>
              <Text size="xs" c="text-secondary">
                {t`Applies after summarizing`}
              </Text>
              {filters.map(({ summary, filter }, index) => (
                <FilterTokenView
                  key={index}
                  query={summary.query}
                  stageIndex={summary.stageIndex}
                  isSummary
                  isNested
                  compact={compactReading}
                  clause={filter}
                  onReplace={(filterable) =>
                    commit(
                      Lib.replaceClause(
                        summary.query,
                        summary.stageIndex,
                        filter,
                        filterable,
                      ),
                    )
                  }
                  onRemove={() =>
                    commit(
                      Lib.removeClause(
                        summary.query,
                        summary.stageIndex,
                        filter,
                      ),
                    )
                  }
                />
              ))}
              <AddSummaryFilter
                columns={columns}
                summaryCount={summaries.length}
                label={t`Add a filter`}
                isNested
                onAdd={({ summary }, filterable) =>
                  commit(
                    Lib.filter(summary.query, summary.stageIndex, filterable),
                  )
                }
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>
      )}
    </Button.Group>
  );
}
