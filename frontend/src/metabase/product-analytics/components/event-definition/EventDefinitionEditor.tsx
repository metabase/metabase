import type { KeyboardEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { Box, Button, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  type EventDefinition,
  getConditionsName,
  getEventQuery,
  getQueryEventDefinition,
} from "../../event-definition";
import { useClickOutsideFirst } from "../../use-click-outside-first";
import { FilterPills } from "../FilterPills";

const STAGE_INDEX = -1;

type EventDefinitionEditorProps = {
  /** The event to edit, or `null` to define a new one. */
  value: EventDefinition | null;
  /** The event table's query, which the conditions filter. */
  tableQuery: Lib.Query;
  onCancel: () => void;
  onSubmit: (value: EventDefinition) => void;
};

/**
 * Edits a draft of an event's conditions and name until it's submitted, by the
 * Done button, Enter in the name, or a click outside the editor. A click
 * outside cancels it instead when there are no conditions. The name follows
 * the conditions until the user types one.
 */
export const EventDefinitionEditor = ({
  value,
  tableQuery,
  onCancel,
  onSubmit,
}: EventDefinitionEditorProps) => {
  const [query, setQuery] = useState(() =>
    value !== null ? getEventQuery(tableQuery, value) : tableQuery,
  );
  const [customName, setCustomName] = useState(value?.name ?? null);
  // The name as typed, which EditableText only commits on blur. Enter is
  // handled before that commit renders, so it submits this instead.
  const [draftName, setDraftName] = useState<string | null>(null);
  const hasConditions = Lib.filters(query, STAGE_INDEX).length > 0;
  const shownName = customName ?? getConditionsName(query);

  const handleNameChange = (newName: string) => {
    const trimmedName = newName.trim();
    if (trimmedName !== "") {
      setCustomName(trimmedName);
    }
  };

  const handleSubmit = () => {
    if (hasConditions) {
      const name = draftName?.trim() || customName;
      onSubmit(getQueryEventDefinition(query, name));
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
    hasConditions ? handleSubmit : onCancel,
  );

  return (
    <Stack
      gap="sm"
      p="sm"
      bg="background_page-primary"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      onPointerDownCapture={handlePointerDownInside}
    >
      <Box onKeyDown={handleNameKeyDown}>
        <EditableText
          // Remounts when the shown name changes. Otherwise EditableText
          // commits the new name on blur, as if the user typed it.
          key={shownName}
          w="100%"
          bg="input-background"
          bd="1px solid var(--mb-color-border-neutral)"
          bdrs="xs"
          initialValue={shownName}
          placeholder={t`Give this set of conditions a name`}
          data-testid="event-definition-name"
          onChange={handleNameChange}
          onContentChange={setDraftName}
          onBlur={() => setDraftName(null)}
        />
      </Box>
      <FilterPills
        query={query}
        addLabel={t`Add a condition`}
        isAddPickerInitiallyOpened={!hasConditions}
        onChange={setQuery}
      />
      {hasConditions && (
        <Button fullWidth onClick={handleSubmit}>
          {t`Done`}
        </Button>
      )}
    </Stack>
  );
};
