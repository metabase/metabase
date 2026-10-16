import { useState } from "react";
import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Popover,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./ConditionsEditor.module.css";

const STAGE_INDEX = -1;

type ConditionsEditorProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  /** Opens the condition picker right away, for a query without conditions. */
  initialOpened?: boolean;
};

/**
 * The query's filters as pills, each editable. With none, an outlined pill
 * invites the first; after that a plus at the end of the row adds more.
 */
export const ConditionsEditor = ({
  query,
  onChange,
  initialOpened = false,
}: ConditionsEditorProps) => {
  const filters = Lib.filters(query, STAGE_INDEX);

  return (
    <Flex gap="sm" wrap="wrap" align="center">
      {filters.map((filter, filterIndex) => (
        <ConditionPill
          key={filterIndex}
          query={query}
          filter={filter}
          filterIndex={filterIndex}
          onChange={onChange}
        />
      ))}
      <AddCondition
        query={query}
        isFirst={filters.length === 0}
        onChange={onChange}
        initialOpened={initialOpened}
      />
    </Flex>
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
  const isSegment = Lib.isSegmentFilter(query, STAGE_INDEX, filter);

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
          {isSegment && <Icon name="segment" size={12} />}
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

type AddConditionProps = {
  query: Lib.Query;
  isFirst: boolean;
  onChange: (query: Lib.Query) => void;
  initialOpened: boolean;
};

const AddCondition = ({
  query,
  isFirst,
  onChange,
  initialOpened,
}: AddConditionProps) => {
  const [isOpened, setIsOpened] = useState(initialOpened);

  const handleSelect = (filter: Lib.Filterable) => {
    onChange(Lib.filter(query, STAGE_INDEX, filter));
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        {isFirst ? (
          <UnstyledButton
            className={S.addPill}
            onClick={() => setIsOpened(!isOpened)}
          >
            <Icon name="add" size={12} />
            {t`Add a condition`}
          </UnstyledButton>
        ) : (
          <ActionIcon
            className={S.addIcon}
            size="sm"
            variant="filled"
            aria-label={t`Add a condition`}
            onClick={() => setIsOpened(!isOpened)}
          >
            <Icon name="add" size={12} />
          </ActionIcon>
        )}
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
