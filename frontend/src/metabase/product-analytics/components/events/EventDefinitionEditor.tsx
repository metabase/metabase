import type { KeyboardEvent } from "react";
import { useState } from "react";
import { c, t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { useMetadataProvider } from "metabase/metadata-store";
import { Button, Group, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { readEventQuery } from "../../events/read-event-query";
import type { EventDefinition } from "../../events/types";
import { useClickOutsideFirst } from "../../use-click-outside-first";

import { ConditionsEditor } from "./ConditionsEditor";

const STAGE_INDEX = -1;

type EventDefinitionEditorProps = {
  id?: string;
  value: EventDefinition | null;
  tableQuery: Lib.Query;
  namePlaceholder?: string;
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
  namePlaceholder = t`Give this set of conditions a name`,
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
  // The name as typed, which EditableText only commits on blur. Enter is
  // handled before that blur commits, so it submits this instead.
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

  const handlePointerDownInside = useClickOutsideFirst(
    canSubmit ? handleSubmit : onCancel,
  );

  return (
    <Stack
      id={id}
      gap="sm"
      p="sm"
      bg="background-primary"
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
          w="100%"
          bg="input-background"
          bd="1px solid var(--mb-color-border-neutral)"
          bdrs="xs"
          initialValue={committedName}
          placeholder={namePlaceholder}
          data-testid="event-definition-name"
          onChange={handleNameChange}
          onContentChange={setDraftName}
          onBlur={() => setDraftName(null)}
        />
      </Group>
      <ConditionsEditor
        query={query}
        onChange={setQuery}
        initialOpened={filters.length === 0}
      />
      {filters.length > 0 && (
        <Button fullWidth disabled={!canSubmit} onClick={handleSubmit}>
          {t`Done`}
        </Button>
      )}
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
