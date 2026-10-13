import { useState } from "react";
import { c, t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { useMetadataProvider } from "metabase/metadata-store";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  ActionIcon,
  Button,
  Flex,
  Group,
  Icon,
  Menu,
  Popover,
  Stack,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { readEventQuery } from "../../events/read-event-query";
import type { EventDefinition } from "../../events/types";

const STAGE_INDEX = -1;
const EDITABLE_TEXT_OFFSET = "calc(-0.25rem - 1px)";

type EventDefinitionEditorProps = {
  id?: string;
  value: EventDefinition | null;
  tableQuery: Lib.Query;
  onCancel: () => void;
  onSubmit: (value: EventDefinition) => void;
};

/**
 * Edits a draft of an event's conditions and name until it's submitted. The
 * name follows the conditions until the user changes it.
 */
export const EventDefinitionEditor = ({
  id,
  value,
  tableQuery,
  onCancel,
  onSubmit,
}: EventDefinitionEditorProps) => {
  const metadataProvider = useMetadataProvider(Lib.databaseID(tableQuery));
  const [query, setQuery] = useState(
    () => (value && readEventQuery(metadataProvider, value)) ?? tableQuery,
  );
  const [customName, setCustomName] = useState(() =>
    value && value.name !== getConditionsName(query) ? value.name : null,
  );
  const filters = Lib.filters(query, STAGE_INDEX);
  const name = customName ?? getConditionsName(query);
  const canSubmit = name !== "" && filters.length > 0;

  const handleNameChange = (newName: string) => {
    const trimmedName = newName.trim();
    if (trimmedName !== "") {
      setCustomName(trimmedName);
    }
  };

  const handleSubmit = () => onSubmit({ name, query: Lib.toJsQuery(query) });

  return (
    <Stack
      id={id}
      gap="sm"
      p="sm"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
    >
      <Group gap="xs" wrap="nowrap">
        <EditableText
          // Remounts so a cleared name reverts to the current one.
          key={name}
          flex={1}
          miw={0}
          // Offsets its own border and padding, so the name doesn't shift
          // from where EventDefinitionSummary shows it.
          ml={EDITABLE_TEXT_OFFSET}
          my={EDITABLE_TEXT_OFFSET}
          fz="md"
          initialValue={name}
          placeholder={t`Give this a name`}
          data-testid="event-definition-name"
          onChange={handleNameChange}
        />
        <Tooltip label={t`Done`}>
          <ActionIcon
            c="icon-primary"
            aria-label={t`Done`}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <Icon name="check" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Discard changes`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Discard changes`}
            onClick={onCancel}
          >
            <Icon name="revert" />
          </ActionIcon>
        </Tooltip>
      </Group>
      {filters.length > 0 && (
        <Flex gap="sm" wrap="wrap">
          {filters.map((filter, filterIndex) => (
            <ConditionPill
              key={filterIndex}
              query={query}
              filter={filter}
              filterIndex={filterIndex}
              onChange={setQuery}
            />
          ))}
        </Flex>
      )}
      <Group gap="sm" grow>
        <AddConditionButton query={query} onChange={setQuery} />
        <BrowseActionsButton query={query} onChange={setQuery} />
      </Group>
    </Stack>
  );
};

/** The conditions' names joined with "and", or "" without conditions. */
const getConditionsName = (query: Lib.Query): string => {
  const [first, ...rest] = Lib.filters(query, STAGE_INDEX).map(
    (filter) => Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
  );
  return rest.reduce(
    (names, name) =>
      c("{0} is a list of conditions, {1} is one more condition")
        .t`${names} and ${name}`,
    first ?? "",
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
        <FilterPicker
          query={query}
          stageIndex={STAGE_INDEX}
          filter={filter}
          filterIndex={filterIndex}
          onSelect={handleSelect}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

type QueryEditorProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
};

const AddConditionButton = ({ query, onChange }: QueryEditorProps) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleSelect = (filter: Lib.Filterable) => {
    onChange(Lib.filter(query, STAGE_INDEX, filter));
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        <Button
          variant="filled"
          leftSection={<Icon name="add" />}
          onClick={() => setIsOpened(!isOpened)}
        >
          {t`Add a condition`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={STAGE_INDEX}
          onSelect={handleSelect}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

const BrowseActionsButton = ({ query, onChange }: QueryEditorProps) => {
  const segments = Lib.availableSegments(query, STAGE_INDEX);

  if (segments.length === 0) {
    return null;
  }

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <Button leftSection={<Icon name="segment" />}>
          {t`Browse actions`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {segments.map((segment) => {
          const { name, displayName, filterPositions } = Lib.displayInfo(
            query,
            STAGE_INDEX,
            segment,
          );
          const isApplied = (filterPositions?.length ?? 0) > 0;
          return (
            <Menu.Item
              key={name}
              disabled={isApplied}
              onClick={() => onChange(Lib.filter(query, STAGE_INDEX, segment))}
            >
              {displayName}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};
