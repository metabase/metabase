import { useCallback, useRef, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { MiniPicker } from "metabase/common/components/Pickers/MiniPicker";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import { useNavigate } from "metabase/router";
import { Button, FixedSizeIcon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isNamelessSchema } from "metabase-lib/v1/metadata/utils/schema";
import type { DatabaseId, SchemaName } from "metabase-types/api";

import S from "./SchemaPickerInput.module.css";

// Characters typed within this interval extend one typeahead query.
const TYPEAHEAD_RESET_MS = 500;
// List items the typeahead can move to; the "Back" header is not one of them.
const TYPEAHEAD_ITEM_SELECTOR =
  '[role="menuitem"]:not([data-testid="mini-picker-header"])';

type SchemaPickerInputProps = {
  databaseId: DatabaseId | undefined;
  schema: SchemaName | undefined;
  onSchemaChange: () => void;
};

export function SchemaPickerInput({
  databaseId,
  schema,
  onSchemaChange,
}: SchemaPickerInputProps) {
  const navigate = useNavigate();
  const [opened, setOpened] = useState(databaseId == null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Mantine's `returnFocus` is not used: it would also pull focus back from
  // whatever the user clicked to close the dropdown. Escape returns focus
  // natively; picking an item and Shift+Tab do it here.
  const closeAndFocusTrigger = useCallback(() => {
    setOpened(false);
    triggerRef.current?.focus();
  }, []);

  const typeaheadRef = useRef({ query: "", resetTimeout: -1 });

  // Mantine's Menu has no typeahead: typing moves focus to the matching item.
  const handleTypeahead = (event: React.KeyboardEvent<HTMLElement>) => {
    const isCharacter =
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey;
    const typeahead = typeaheadRef.current;
    // Outside a query, Space keeps activating the focused item.
    if (!isCharacter || (event.key === " " && typeahead.query === "")) {
      return;
    }
    event.preventDefault();
    // Keep typed characters from triggering global shortcuts such as "g h".
    event.stopPropagation();
    window.clearTimeout(typeahead.resetTimeout);
    typeahead.query += event.key;
    typeahead.resetTimeout = window.setTimeout(() => {
      typeahead.query = "";
    }, TYPEAHEAD_RESET_MS);

    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        TYPEAHEAD_ITEM_SELECTOR,
      ),
    ];
    const query = typeahead.query.toLowerCase();
    items
      .find((item) => item.textContent?.toLowerCase().includes(query))
      ?.focus();
  };

  const handleDropdownKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // Mantine's focus trap keeps Tab inside the dropdown; Shift+Tab leaves it
    // back to the trigger instead.
    if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      closeAndFocusTrigger();
      return;
    }
    handleTypeahead(event);
  };

  const handleChange = useCallback(
    (picked: MiniPickerPickableItem) => {
      // We restrict to `models: ["schema"]`, but the union is wider so we need to add a guard.
      if (picked.model !== "schema") {
        return;
      }
      onSchemaChange();
      navigate(
        Urls.dataStudioSchemaViewer({
          databaseId: picked.database_id,
          schema: picked.name,
        }),
      );
      closeAndFocusTrigger();
    },
    [onSchemaChange, navigate, closeAndFocusTrigger],
  );

  const hasNamedSchema = schema != null && schema.length > 0;
  // Schema-less DBs (MySQL, Mongo, …) report a single nameless schema.
  // For this scenario we want to display DB name instead of the schema name.
  const hasNamelessSchema = isNamelessSchema(schema) && databaseId != null;

  const { data: database } = useGetDatabaseQuery(
    hasNamelessSchema ? { id: databaseId } : skipToken,
  );

  const isInputEmpty = !hasNamedSchema && !hasNamelessSchema;
  const label = match({ hasNamedSchema, hasNamelessSchema })
    .with({ hasNamedSchema: true }, () => schema)
    .with({ hasNamelessSchema: true }, () => database?.name)
    .otherwise(() => null);

  return (
    <MiniPicker
      opened={opened}
      // Focuses the first item whenever the list changes, e.g. after
      // opening a database.
      trapFocus
      onClose={() => setOpened(false)}
      models={["schema"]}
      includeHiddenSchemas
      onChange={handleChange}
      menuProps={{
        // This allows to toggle menu by clicking the trigger button.
        onChange: setOpened,
        clickOutsideEvents: ["pointerdown", "touchstart"],
        position: "bottom-start",
        // Move focus into the dropdown when it opens.
        trapFocus: true,
      }}
      menuDropdownProps={{ onKeyDown: handleDropdownKeyDown }}
    >
      <Button
        ref={triggerRef}
        size="lg"
        className={S.triggerButton}
        leftSection={
          <FixedSizeIcon
            name="database"
            c={isInputEmpty ? "text-disabled" : undefined}
          />
        }
        rightSection={
          <FixedSizeIcon
            name="chevrondown"
            c={isInputEmpty ? "text-disabled" : undefined}
          />
        }
        data-testid="schema-picker-button"
      >
        {isInputEmpty ? (
          <Text c="text-secondary" fw={700}>
            {t`Pick a schema to view`}
          </Text>
        ) : (
          label
        )}
      </Button>
    </MiniPicker>
  );
}
