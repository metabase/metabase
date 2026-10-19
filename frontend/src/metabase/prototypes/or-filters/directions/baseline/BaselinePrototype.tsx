import { useState } from "react";
import { t } from "ttag";

import { FilterPanel } from "metabase/querying/filters/components/FilterPanel";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ClauseStep } from "metabase/querying/notebook/components/ClauseStep";
import { Button, Group, Icon, Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import type { FilterUiProps } from "../../types";

/** Today's behavior: the real FilterPanel pills and the real notebook step. */
export function BaselinePrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  return variant === "chill" ? (
    <BaselineChill query={query} stageIndex={stageIndex} onChange={onChange} />
  ) : (
    <BaselineNotebook
      query={query}
      stageIndex={stageIndex}
      onChange={onChange}
    />
  );
}

type VariantProps = Omit<FilterUiProps, "variant">;

function BaselineChill({ query, stageIndex, onChange }: VariantProps) {
  const [isOpened, setIsOpened] = useState(false);
  const hasFilters = Lib.filters(query, stageIndex).length > 0;

  return (
    <Group gap="sm" align="center">
      <FilterPanel query={query} onChange={onChange} />
      {!hasFilters && <Text c="text-secondary">{t`No filters`}</Text>}
      <Popover
        opened={isOpened}
        position="bottom-start"
        transitionProps={{ duration: 0 }}
        onChange={setIsOpened}
      >
        <Popover.Target>
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={() => setIsOpened((opened) => !opened)}
          >
            {t`Add filter`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <FilterPicker
            query={query}
            stageIndex={stageIndex}
            onSelect={(filter) => {
              onChange(Lib.filter(query, stageIndex, filter));
              setIsOpened(false);
            }}
            onClose={() => setIsOpened(false)}
          />
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}

function BaselineNotebook({ query, stageIndex, onChange }: VariantProps) {
  const filters = Lib.filters(query, stageIndex);

  return (
    <ClauseStep
      color="core-filter"
      items={filters}
      initialAddText={t`Add filters to narrow your answer`}
      renderName={(filter) => getFilterLabel(query, stageIndex, filter)}
      renderPopover={({ item: filter, index, onClose }) => (
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={index}
          onSelect={(newFilter) => {
            onChange(
              filter
                ? Lib.replaceClause(query, stageIndex, filter, newFilter)
                : Lib.filter(query, stageIndex, newFilter),
            );
          }}
          onClose={onClose}
        />
      )}
      onRemove={(filter) =>
        onChange(Lib.removeClause(query, stageIndex, filter))
      }
      onReorder={(source, target) =>
        onChange(Lib.swapClauses(query, stageIndex, source, target))
      }
    />
  );
}
