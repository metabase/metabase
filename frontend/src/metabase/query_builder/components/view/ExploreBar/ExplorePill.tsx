import cx from "classnames";
import { forwardRef, useState } from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Box, Icon, Menu, Popover, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import S from "./ExploreBar.module.css";
import { STAGE_INDEX } from "./utils";

export type ExplorePillItem =
  | {
      key: string;
      kind: "filter";
      clause: Lib.FilterClause;
      index: number;
      label: string;
    }
  | {
      key: string;
      kind: "aggregation";
      clause: Lib.AggregationClause;
      index: number;
      label: string;
    }
  | {
      key: string;
      kind: "breakout";
      clause: Lib.BreakoutClause;
      index: number;
      label: string;
    };

const PILL_ICONS: Record<ExplorePillItem["kind"], IconName> = {
  filter: "filter",
  aggregation: "sum",
  breakout: "split",
};

type ExplorePillProps = {
  pill: ExplorePillItem;
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

/** A clause of the question as a pill: click to edit it in place, × to remove it. */
export function ExplorePill({ pill, query, onQueryChange }: ExplorePillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);

  const handleRemove = () =>
    onQueryChange(Lib.removeClause(query, STAGE_INDEX, pill.clause));

  if (pill.kind === "breakout") {
    return (
      <BreakoutPill
        pill={pill}
        query={query}
        onQueryChange={onQueryChange}
        onRemove={handleRemove}
      />
    );
  }

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="bottom-start"
      trapFocus
    >
      <Popover.Target>
        <PillBody
          pill={pill}
          onClick={() => setIsOpen(!isOpen)}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        {pill.kind === "filter" ? (
          <FilterPicker
            query={query}
            stageIndex={STAGE_INDEX}
            filter={pill.clause}
            filterIndex={pill.index}
            onSelect={(filter) => {
              onQueryChange(
                Lib.replaceClause(query, STAGE_INDEX, pill.clause, filter),
              );
              close();
            }}
            onClose={close}
          />
        ) : (
          <AggregationPicker
            query={query}
            stageIndex={STAGE_INDEX}
            clause={pill.clause}
            clauseIndex={pill.index}
            operators={Lib.selectedAggregationOperators(
              Lib.availableAggregationOperators(query, STAGE_INDEX),
              pill.clause,
            )}
            allowCustomExpressions
            allowMetrics
            onQueryChange={(nextQuery) => {
              onQueryChange(nextQuery);
              close();
            }}
            onClose={close}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

type BreakoutPillProps = {
  pill: Extract<ExplorePillItem, { kind: "breakout" }>;
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
  onRemove: () => void;
};

/** A grouping; dates get a menu to change how they're grouped. */
function BreakoutPill({
  pill,
  query,
  onQueryChange,
  onRemove,
}: BreakoutPillProps) {
  const column = Lib.breakoutColumn(query, STAGE_INDEX, pill.clause);
  const buckets =
    column != null && Lib.isTemporal(column)
      ? Lib.availableTemporalBuckets(query, STAGE_INDEX, column)
      : [];
  const currentBucket = Lib.temporalBucket(pill.clause);
  const currentBucketName = currentBucket
    ? Lib.displayInfo(query, STAGE_INDEX, currentBucket).shortName
    : null;

  if (column == null || buckets.length === 0) {
    return <PillBody pill={pill} onRemove={onRemove} />;
  }

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <PillBody pill={pill} onRemove={onRemove} hasMenu />
      </Menu.Target>
      <Menu.Dropdown mah="20rem" style={{ overflowY: "auto" }}>
        {buckets.map((bucket) => {
          const { displayName, shortName } = Lib.displayInfo(
            query,
            STAGE_INDEX,
            bucket,
          );
          return (
            <Menu.Item
              key={shortName}
              rightSection={
                shortName === currentBucketName ? <Icon name="check" /> : null
              }
              onClick={() =>
                onQueryChange(
                  Lib.replaceClause(
                    query,
                    STAGE_INDEX,
                    pill.clause,
                    Lib.withTemporalBucket(column, bucket),
                  ),
                )
              }
            >
              {displayName}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

type PillBodyProps = {
  pill: ExplorePillItem;
  hasMenu?: boolean;
  className?: string;
  onClick?: () => void;
  onRemove: () => void;
};

const PillBody = forwardRef<HTMLDivElement, PillBodyProps>(function PillBody(
  { pill, hasMenu, className, onClick, onRemove, ...props },
  ref,
) {
  // popover and menu targets pass their own props, className included, so merge rather than replace
  return (
    <Box
      ref={ref}
      {...props}
      className={cx(S.pill, S[`pill-${pill.kind}`], className)}
      data-testid="explore-pill"
    >
      <UnstyledButton
        className={S.pillButton}
        aria-label={t`Edit ${pill.label}`}
        onClick={onClick}
      >
        <Icon name={PILL_ICONS[pill.kind]} size={12} />
        <span className={S.pillLabel}>{pill.label}</span>
        {hasMenu && <Icon name="chevrondown" size={10} />}
      </UnstyledButton>
      <UnstyledButton
        className={S.pillRemove}
        aria-label={t`Remove ${pill.label}`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <Icon name="close" size={10} />
      </UnstyledButton>
    </Box>
  );
});
