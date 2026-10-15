import { useState } from "react";
import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Box, Button, Flex, Icon, Popover, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

type ConditionsEditorProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  /** Opens the condition picker right away, for a query without conditions. */
  initialOpened?: boolean;
};

/** The query's filters as pills, each editable, plus a button to add one. */
export const ConditionsEditor = ({
  query,
  onChange,
  initialOpened = false,
}: ConditionsEditorProps) => {
  const filters = Lib.filters(query, STAGE_INDEX);

  return (
    <Stack gap="sm">
      {filters.length > 0 && (
        <Flex gap="sm" wrap="wrap">
          {filters.map((filter, filterIndex) => (
            <ConditionPill
              key={filterIndex}
              query={query}
              filter={filter}
              filterIndex={filterIndex}
              onChange={onChange}
            />
          ))}
        </Flex>
      )}
      <AddConditionButton
        query={query}
        onChange={onChange}
        initialOpened={initialOpened}
      />
    </Stack>
  );
};

type ConditionPillProps = {
  query: Lib.Query;
  filter: Lib.FilterClause;
  filterIndex: number;
  onChange: (query: Lib.Query) => void;
};

const ConditionPill = ({
  query,
  filter,
  filterIndex,
  onChange,
}: ConditionPillProps) => {
  const [isOpened, setIsOpened] = useState(false);
  const { displayName } = Lib.displayInfo(query, STAGE_INDEX, filter);

  const handleSelect = (newFilter: Lib.Filterable) => {
    onChange(Lib.replaceClause(query, STAGE_INDEX, filter, newFilter));
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        <FilterPill
          onClick={() => setIsOpened(!isOpened)}
          onRemoveClick={() =>
            onChange(Lib.removeClause(query, STAGE_INDEX, filter))
          }
        >
          {displayName}
        </FilterPill>
      </Popover.Target>
      <Popover.Dropdown>
        <Box mah="80vh">
          <FilterPicker
            query={query}
            stageIndex={STAGE_INDEX}
            filter={filter}
            filterIndex={filterIndex}
            onSelect={handleSelect}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};

type AddConditionButtonProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  initialOpened: boolean;
};

const AddConditionButton = ({
  query,
  onChange,
  initialOpened,
}: AddConditionButtonProps) => {
  const [isOpened, setIsOpened] = useState(initialOpened);

  const handleSelect = (filter: Lib.Filterable) => {
    onChange(Lib.filter(query, STAGE_INDEX, filter));
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        <Button
          leftSection={<Icon name="add" />}
          onClick={() => setIsOpened(!isOpened)}
        >
          {t`Add a condition`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Box mah="80vh">
          <FilterPicker
            query={query}
            stageIndex={STAGE_INDEX}
            onSelect={handleSelect}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
