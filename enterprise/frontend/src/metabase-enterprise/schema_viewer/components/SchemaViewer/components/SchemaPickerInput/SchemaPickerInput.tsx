import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { MiniPicker } from "metabase/common/components/Pickers/MiniPicker";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import { useDispatch } from "metabase/redux";
import { Button, FixedSizeIcon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DatabaseId, SchemaName } from "metabase-types/api";

import S from "./SchemaPickerInput.module.css";

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
  const dispatch = useDispatch();
  const [opened, setOpened] = useState(databaseId == null);

  const handleChange = useCallback(
    (picked: MiniPickerPickableItem) => {
      // We restrict to `models: ["schema"]`, but the union is wider so we need to add a guard.
      if (picked.model !== "schema") {
        return;
      }
      onSchemaChange();
      dispatch(
        push(
          Urls.dataStudioSchemaViewer({
            databaseId: picked.database_id,
            schema: picked.name,
          }),
        ),
      );
      setOpened(false);
    },
    [dispatch, onSchemaChange],
  );

  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  const hasNamedSchema = schema != null && schema.length > 0;
  // Schema-less DBs (MySQL, Mongo, …) report a single nameless schema (`""`);
  // For this scenario we want to display DB name instead of the schema name.
  const hasNamelessSchema = schema === "" && databaseId != null;
  const isInputEmpty = !hasNamedSchema && !hasNamelessSchema;
  const label = hasNamedSchema
    ? schema
    : hasNamelessSchema
      ? database?.name
      : null;

  return (
    <MiniPicker
      opened={opened}
      onClose={() => setOpened(false)}
      models={["schema"]}
      includeHiddenSchemas
      onChange={handleChange}
      menuProps={{
        // This allows to toggle menu by clicking the trigger button.
        onChange: setOpened,
        clickOutsideEvents: ["pointerdown", "touchstart"],
        position: "bottom-start",
      }}
    >
      <Button
        variant="default"
        className={S.triggerButton}
        leftSection={
          <FixedSizeIcon
            name="database"
            c={isInputEmpty ? "text-tertiary" : undefined}
          />
        }
        rightSection={
          <FixedSizeIcon
            name="chevrondown"
            c={isInputEmpty ? "text-tertiary" : undefined}
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
