import { useState } from "react";
import { t } from "ttag";

import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import type { CustomListItem } from "metabase/querying/filters/components/FilterPicker/types";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Popover,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { segmentFilterables } from "../../segments/to-event-definition";
import { useSegmentPickerItems } from "../../segments/use-segment-picker-items";

import S from "./ConditionsEditor.module.css";

const STAGE_INDEX = -1;

/**
 * The picker's props for this session's drafts, listed after the table's saved
 * segments, or none. Picking a draft adds its conditions to `query`, after
 * taking out `filter` when one is being replaced.
 */
const useDraftPickerProps = (
  query: Lib.Query,
  withDrafts: boolean,
  onChange: (query: Lib.Query) => void,
  filter?: Lib.FilterClause,
) => {
  const metadataProvider = useMetadataProvider(Lib.databaseID(query));
  const { getGroupItems, findSegment } = useSegmentPickerItems({
    query,
    withEventDrafts: withDrafts,
  });

  const onCustomItemSelect = (item: CustomListItem) => {
    const segment = findSegment(item);
    if (segment === undefined) {
      return;
    }
    const base =
      filter !== undefined
        ? Lib.removeClause(query, STAGE_INDEX, filter)
        : query;
    const filterables = segmentFilterables(query, metadataProvider, segment);
    onChange(
      filterables.reduce(
        (current, filterable) => Lib.filter(current, STAGE_INDEX, filterable),
        base,
      ),
    );
  };

  return { getGroupItems, onCustomItemSelect };
};

type ConditionsEditorProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  /** Opens the condition picker right away, for a query without conditions. */
  initialOpened?: boolean;
  /** Lists this session's drafts after the table's saved segments. */
  withDrafts?: boolean;
};

/**
 * The query's filters as pills, each editable. With none, an outlined pill
 * invites the first; after that a plus at the end of the row adds more.
 */
export const ConditionsEditor = ({
  query,
  onChange,
  initialOpened = false,
  withDrafts = true,
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
          withDrafts={withDrafts}
          onChange={onChange}
        />
      ))}
      <AddCondition
        query={query}
        isFirst={filters.length === 0}
        withDrafts={withDrafts}
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
  /** Lists this session's drafts after the table's saved segments. */
  withDrafts?: boolean;
  onChange: (query: Lib.Query) => void;
};

/** A filter as a pill that opens its picker; segments get their icon. */
export const ConditionPill = ({
  query,
  filter,
  filterIndex,
  withDrafts = true,
  onChange,
}: ConditionPillProps) => {
  const [isOpened, setIsOpened] = useState(false);
  const { displayName } = Lib.displayInfo(query, STAGE_INDEX, filter);
  const isSegment = Lib.isSegmentFilter(query, STAGE_INDEX, filter);

  const handleChange = (newQuery: Lib.Query) => {
    onChange(newQuery);
    setIsOpened(false);
  };
  const draftPickerProps = useDraftPickerProps(
    query,
    withDrafts,
    handleChange,
    filter,
  );

  const handleSelect = (newFilter: Lib.Filterable) => {
    handleChange(Lib.replaceClause(query, STAGE_INDEX, filter, newFilter));
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
            {...draftPickerProps}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};

type AddConditionProps = {
  query: Lib.Query;
  isFirst: boolean;
  withDrafts: boolean;
  onChange: (query: Lib.Query) => void;
  initialOpened: boolean;
};

const AddCondition = ({
  query,
  isFirst,
  withDrafts,
  onChange,
  initialOpened,
}: AddConditionProps) => {
  const [isOpened, setIsOpened] = useState(initialOpened);

  const handleChange = (newQuery: Lib.Query) => {
    onChange(newQuery);
    setIsOpened(false);
  };
  const draftPickerProps = useDraftPickerProps(query, withDrafts, handleChange);

  const handleSelect = (filter: Lib.Filterable) => {
    handleChange(Lib.filter(query, STAGE_INDEX, filter));
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
            {...draftPickerProps}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
