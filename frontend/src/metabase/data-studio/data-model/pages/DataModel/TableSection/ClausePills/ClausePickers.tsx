import { type JSX, type ReactNode, type Ref, useState } from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Pill,
  type PillProps,
  Popover,
  useStablePopoverPosition,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./ClausePickers.module.css";
import { ClausePillLabel, type QueryClause } from "./ClausePills";

const STAGE_INDEX = -1;

type ClausePickersProps = {
  query: Lib.Query;
  /** Without it, the clauses open to be looked at but can't be changed */
  onChange?: (query: Lib.Query) => void;
};

// A read-only picker's changes go nowhere; its controls are disabled anyway
const NO_CHANGE = () => undefined;

/**
 * A segment's filters as pills that open the filter picker, and a button to
 * add another, laid out in one line to fit a list row
 */
export function FilterClausePickers({ query, onChange }: ClausePickersProps) {
  const filters = Lib.filters(query, STAGE_INDEX);

  return (
    <Group gap="xs" wrap="nowrap" miw={0}>
      {filters.map((filter, index) => (
        <ClausePickerPopover
          key={index}
          readOnly={onChange == null}
          renderTarget={(onToggle) => (
            <ClausePill
              kind="filter"
              name={Lib.displayInfo(query, STAGE_INDEX, filter).displayName}
              onClick={onToggle}
              onRemove={
                onChange &&
                (() => onChange(Lib.removeClause(query, STAGE_INDEX, filter)))
              }
            />
          )}
          renderPicker={(onClose) => (
            <FilterPicker
              query={query}
              stageIndex={STAGE_INDEX}
              filter={filter}
              filterIndex={index}
              onSelect={(newFilter) =>
                onChange?.(
                  Lib.replaceClause(query, STAGE_INDEX, filter, newFilter),
                )
              }
              onClose={onClose}
            />
          )}
        />
      ))}
      {onChange != null && (
        <ClausePickerPopover
          renderTarget={(onToggle) =>
            filters.length > 0 ? (
              <ActionIcon
                size="sm"
                // Round, like the pills beside it
                radius="xl"
                aria-label={t`Add filter`}
                flex="0 0 auto"
                onClick={onToggle}
              >
                <Icon name="add" />
              </ActionIcon>
            ) : (
              <Button
                size="sm"
                variant="subtle"
                leftSection={<Icon name="add" />}
                onClick={onToggle}
              >
                {t`Add filter`}
              </Button>
            )
          }
          renderPicker={(onClose) => (
            <FilterPicker
              query={query}
              stageIndex={STAGE_INDEX}
              onSelect={(newFilter) =>
                onChange(Lib.filter(query, STAGE_INDEX, newFilter))
              }
              onClose={onClose}
            />
          )}
        />
      )}
    </Group>
  );
}

/**
 * A measure's aggregation as a pill that opens the aggregation picker, or a
 * button to pick one when there's none yet
 */
export function AggregationClausePicker({
  query,
  onChange,
}: ClausePickersProps) {
  const aggregation = Lib.aggregations(query, STAGE_INDEX)[0];
  if (onChange == null && !aggregation) {
    return null;
  }

  return (
    <ClausePickerPopover
      readOnly={onChange == null}
      renderTarget={(onToggle) =>
        aggregation ? (
          <ClausePill
            kind="aggregation"
            name={Lib.displayInfo(query, STAGE_INDEX, aggregation).displayName}
            onClick={onToggle}
            onRemove={
              onChange &&
              (() =>
                onChange(Lib.removeClause(query, STAGE_INDEX, aggregation)))
            }
          />
        ) : (
          <Button
            size="sm"
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={onToggle}
          >
            {t`Pick an aggregation`}
          </Button>
        )
      }
      renderPicker={(onClose) => (
        <AggregationPicker
          query={query}
          stageIndex={STAGE_INDEX}
          clause={aggregation}
          clauseIndex={aggregation ? 0 : undefined}
          operators={getAggregationOperators(query, aggregation)}
          allowCustomExpressions
          allowMetrics={false}
          onQueryChange={onChange ?? NO_CHANGE}
          onClose={onClose}
        />
      )}
    />
  );
}

/** As on the measure page, an aggregation's own operator shows as selected */
function getAggregationOperators(
  query: Lib.Query,
  aggregation: Lib.AggregationClause | undefined,
) {
  const operators = Lib.availableAggregationOperators(query, STAGE_INDEX);
  return aggregation
    ? Lib.selectedAggregationOperators(operators, aggregation)
    : operators;
}

/** A clause's pill that opens its picker; Popover.Target passes it a ref */
function ClausePill({
  kind,
  name,
  ref,
  onRemove,
  ...props
}: QueryClause &
  Omit<PillProps, "children"> & {
    ref?: Ref<HTMLDivElement>;
  }) {
  return (
    <Pill
      ref={ref}
      bdrs="xl"
      role="button"
      tabIndex={0}
      // Long pills shrink, clipped, so the add button stays in the row
      flex="0 1 auto"
      miw={0}
      style={{ cursor: "pointer" }}
      withRemoveButton={onRemove != null}
      removeButtonProps={{ "aria-label": t`Remove` }}
      onRemove={onRemove}
      {...props}
    >
      <ClausePillLabel kind={kind} name={name} />
    </Pill>
  );
}

/** A clause's picker in a popover under the pill or button that opens it */
function ClausePickerPopover({
  readOnly = false,
  renderTarget,
  renderPicker,
}: {
  /** Shows the picker for looking at only: its inputs and buttons disabled */
  readOnly?: boolean;
  renderTarget: (onToggle: () => void) => JSX.Element;
  renderPicker: (onClose: () => void) => ReactNode;
}) {
  const [isOpened, setIsOpened] = useState(false);
  const stablePositionProps = useStablePopoverPosition("bottom-start");
  const onClose = () => setIsOpened(false);

  return (
    <Popover
      position={stablePositionProps.position}
      middlewares={stablePositionProps.middlewares}
      onClose={stablePositionProps.onClose}
      opened={isOpened}
      transitionProps={{ duration: 0 }}
      trapFocus
      onChange={setIsOpened}
    >
      <Popover.Target>
        {renderTarget(() => setIsOpened((isOpened) => !isOpened))}
      </Popover.Target>
      <Popover.Dropdown>
        {isOpened &&
          (readOnly ? (
            // A disabled fieldset disables every input and button inside
            <fieldset disabled className={S.readOnlyPicker}>
              {renderPicker(onClose)}
            </fieldset>
          ) : (
            renderPicker(onClose)
          ))}
      </Popover.Dropdown>
    </Popover>
  );
}
