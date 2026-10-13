import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
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
  Popover,
  Stack,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { readEventQuery } from "../../events/read-event-query";
import type { EventDefinition } from "../../events/types";

const STAGE_INDEX = -1;

type EventDefinitionEditorProps = {
  id?: string;
  value: EventDefinition | null;
  tableQuery: Lib.Query;
  onCancel: () => void;
  onSubmit: (value: EventDefinition) => void;
};

/**
 * Edits a draft of an event's conditions and name until it's submitted, by the
 * Done button, Enter in the name, or a click outside the editor. A click
 * outside cancels it instead when it can't be submitted. The name follows the
 * conditions until the user changes it.
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
  // The name as typed, which EditableText only commits on blur. A click
  // outside is handled before that blur, so it submits this instead.
  const [draftName, setDraftName] = useState<string | null>(null);
  const filters = Lib.filters(query, STAGE_INDEX);
  const committedName = customName ?? getConditionsName(query);
  const name = draftName?.trim() || committedName;
  const canSubmit = name !== "" && filters.length > 0;

  const handleNameChange = (newName: string) => {
    const trimmedName = newName.trim();
    if (trimmedName !== "") {
      setCustomName(trimmedName);
    }
  };

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit({ name, query: Lib.toJsQuery(query) });
    }
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isNameEnter =
      event.key === "Enter" &&
      !event.nativeEvent.isComposing &&
      event.target instanceof HTMLTextAreaElement;
    if (isNameEnter) {
      handleSubmit();
    }
  };

  const handlePointerDownInside = usePointerDownOutside(
    canSubmit ? handleSubmit : onCancel,
  );

  return (
    <Stack
      id={id}
      gap="sm"
      p="sm"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      onPointerDownCapture={handlePointerDownInside}
    >
      <Group gap="xs" wrap="nowrap" onKeyDown={handleNameKeyDown}>
        <EditableText
          // Remounts so a cleared name reverts to the current one.
          key={committedName}
          flex={1}
          miw={0}
          bg="input-background"
          bd="1px solid var(--mb-color-border-neutral)"
          bdrs="xs"
          initialValue={committedName}
          placeholder={t`Give this set of conditions a name`}
          data-testid="event-definition-name"
          onChange={handleNameChange}
          onContentChange={setDraftName}
          onBlur={() => setDraftName(null)}
        />
        <Tooltip label={t`Done`}>
          <ActionIcon
            size="lg"
            c="icon-primary"
            bd="1px solid var(--mb-color-border-neutral)"
            aria-label={t`Done`}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <Icon name="check" />
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
      <AddConditionButton query={query} onChange={setQuery} />
    </Stack>
  );
};

/**
 * Calls `onPointerDownOutside` when a press lands outside the element given the
 * returned `onPointerDownCapture` handler. Presses in its portaled popovers
 * count as inside.
 */
const usePointerDownOutside = (onPointerDownOutside: () => void) => {
  const isInsideRef = useRef(false);
  const onPointerDownOutsideRef = useLatest(onPointerDownOutside);

  useEffect(() => {
    // React events bubble through portals but DOM events don't, so the React
    // handler flags presses inside before this listener on document sees them.
    const handlePointerDown = () => {
      if (!isInsideRef.current) {
        onPointerDownOutsideRef.current();
      }
      isInsideRef.current = false;
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onPointerDownOutsideRef]);

  return () => {
    isInsideRef.current = true;
  };
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
