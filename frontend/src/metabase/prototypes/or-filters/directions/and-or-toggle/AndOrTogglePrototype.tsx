import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ClauseStep } from "metabase/querying/notebook/components/ClauseStep";
import {
  Box,
  Button,
  Group,
  Icon,
  Popover,
  SegmentedControl,
  Text,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";
import { clearFilters } from "../../harness/examples";
import type { FilterUiProps } from "../../types";
import { Token } from "../or-pills/Token";

type Mode = "and" | "or";

type VariantProps = Omit<FilterUiProps, "variant">;

/**
 * One flat list of pills joined by a single, unshown operator that a
 * segmented control switches between AND and OR. OR is stored as one
 * `or(...)` filter; AND as separate top-level filters.
 */
export function AndOrTogglePrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  const { clauses, mode: queryMode } = readPills(query, stageIndex);
  // With fewer than two pills the query can't tell the modes apart.
  const [preferredMode, setPreferredMode] = useState<Mode>("and");
  const mode = clauses.length > 1 ? queryMode : preferredMode;

  const write = (nextClauses: Lib.FilterClause[], nextMode = mode) =>
    onChange(writePills(query, stageIndex, nextClauses, nextMode));

  const handleModeChange = (nextMode: Mode) => {
    setPreferredMode(nextMode);
    write(clauses, nextMode);
  };

  const props = { query, stageIndex, onChange };
  const toggle = <ModeToggle mode={mode} onChange={handleModeChange} />;

  return variant === "chill" ? (
    <PillsChill {...props} clauses={clauses} toggle={toggle} write={write} />
  ) : (
    <PillsNotebook
      {...props}
      clauses={clauses}
      mode={mode}
      toggle={toggle}
      write={write}
    />
  );
}

type PillsProps = VariantProps & {
  clauses: Lib.FilterClause[];
  toggle: ReactNode;
  write: (clauses: Lib.FilterClause[]) => void;
};

function PillsChill({ query, stageIndex, clauses, toggle, write }: PillsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const toClause = (filterable: Lib.Filterable) =>
    toFilterClause(query, stageIndex, filterable);

  return (
    <Group gap="sm" align="center" wrap="nowrap">
      <Group gap="sm" align="center" style={{ flex: 1 }}>
        {clauses.map((clause, index) => (
          <PillWithPicker
            key={index}
            query={query}
            stageIndex={stageIndex}
            clause={clause}
            onReplace={(filterable) =>
              write(clauses.with(index, toClause(filterable)))
            }
            onRemove={() => write(clauses.toSpliced(index, 1))}
          />
        ))}
        {clauses.length === 0 && (
          <Text c="text-secondary">{t`No filters`}</Text>
        )}
        <Popover
          opened={isAdding}
          position="bottom-start"
          transitionProps={{ duration: 0 }}
          onChange={setIsAdding}
        >
          <Popover.Target>
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<Icon name="add" />}
              onClick={() => setIsAdding((opened) => !opened)}
            >
              {t`Add filter`}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <FilterPicker
              query={query}
              stageIndex={stageIndex}
              onSelect={(filterable) => {
                write([...clauses, toClause(filterable)]);
                setIsAdding(false);
              }}
              onClose={() => setIsAdding(false)}
            />
          </Popover.Dropdown>
        </Popover>
      </Group>
      {toggle}
    </Group>
  );
}

function PillsNotebook({
  query,
  stageIndex,
  clauses,
  mode,
  toggle,
  write,
}: PillsProps & { mode: Mode }) {
  return (
    <Group gap="md" align="center" wrap="nowrap">
      <Box style={{ flex: 1 }}>
        <ClauseStep
          color="core-filter"
          items={clauses}
          initialAddText={t`Add filters to narrow your answer`}
          renderName={(clause) => getFilterLabel(query, stageIndex, clause)}
          renderPopover={({ item: clause, index, onClose }) => (
            <FilterPicker
              query={query}
              stageIndex={stageIndex}
              filter={clause}
              onSelect={(filterable) => {
                const next = toFilterClause(query, stageIndex, filterable);
                write(
                  clause && index != null
                    ? clauses.with(index, next)
                    : [...clauses, next],
                );
              }}
              onClose={onClose}
            />
          )}
          onRemove={(clause) => write(clauses.filter((c) => c !== clause))}
          onReorder={(source, target) => {
            const from = clauses.indexOf(source);
            const to = clauses.indexOf(target);
            write(clauses.with(from, target).with(to, source));
          }}
        />
      </Box>
      <Box>
        {toggle}
        <Text size="xs" c="text-secondary" ta="center" mt={4}>
          {mode === "and" ? t`Match all` : t`Match any`}
        </Text>
      </Box>
    </Group>
  );
}

type PillWithPickerProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  onReplace: (filterable: Lib.Filterable) => void;
  onRemove: () => void;
};

function PillWithPicker({
  query,
  stageIndex,
  clause,
  onReplace,
  onRemove,
}: PillWithPickerProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <Token
          onClick={() => setIsOpened((opened) => !opened)}
          onRemove={onRemove}
        >
          {getFilterLabel(query, stageIndex, clause)}
        </Token>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={clause}
          onSelect={(filterable) => {
            onReplace(filterable);
            setIsOpened(false);
          }}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <SegmentedControl
      value={mode}
      onChange={onChange}
      data={[
        {
          value: "and",
          icon: <ModeIcon mode="and" />,
          ariaLabel: t`Match all filters (AND)`,
          withTooltip: true,
        },
        {
          value: "or",
          icon: <ModeIcon mode="or" />,
          ariaLabel: t`Match any filter (OR)`,
          withTooltip: true,
        },
      ]}
    />
  );
}

const LUCIDE_PATHS: Record<Mode, string[]> = {
  // lucide "squares-intersect"
  and: [
    "M10 22a2 2 0 0 1-2-2",
    "M14 2a2 2 0 0 1 2 2",
    "M16 22h-2",
    "M2 10V8",
    "M2 4a2 2 0 0 1 2-2",
    "M20 8a2 2 0 0 1 2 2",
    "M22 14v2",
    "M22 20a2 2 0 0 1-2 2",
    "M4 16a2 2 0 0 1-2-2",
    "M8 10a2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H9a1 1 0 0 1-1-1z",
    "M8 2h2",
  ],
  // lucide "squares-unite"
  or: [
    "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3a1 1 0 0 0-1-1z",
  ],
};

/** The Figma design's lucide icons, inlined since lucide isn't a dependency. */
function ModeIcon({ mode }: { mode: Mode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {LUCIDE_PATHS[mode].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** A lone top-level `or(...)` reads as OR pills; anything else as AND pills. */
function readPills(
  query: Lib.Query,
  stageIndex: number,
): { clauses: Lib.FilterClause[]; mode: Mode } {
  const filters = Lib.filters(query, stageIndex);
  if (filters.length === 1) {
    const parts = Lib.expressionParts(query, stageIndex, filters[0]);
    if (parts.operator === "or") {
      return {
        mode: "or",
        clauses: parts.args.map((arg) =>
          toFilterClause(query, stageIndex, Lib.expressionClause(arg)),
        ),
      };
    }
  }
  return { clauses: filters, mode: "and" };
}

function writePills(
  query: Lib.Query,
  stageIndex: number,
  clauses: Lib.FilterClause[],
  mode: Mode,
): Lib.Query {
  const cleared = clearFilters(query, stageIndex);
  if (mode === "or" && clauses.length > 1) {
    return Lib.filter(cleared, stageIndex, Lib.expressionClause("or", clauses));
  }
  return clauses.reduce(
    (nextQuery, clause) => Lib.filter(nextQuery, stageIndex, clause),
    cleared,
  );
}
