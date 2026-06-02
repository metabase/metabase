import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

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

  const hasSchema = schema != null && schema.length > 0;

  return (
    <MiniPicker
      opened={opened}
      onClose={() => setOpened(false)}
      models={["schema"]}
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
            c={hasSchema ? undefined : "text-tertiary"}
          />
        }
        rightSection={
          <FixedSizeIcon
            name="chevrondown"
            c={hasSchema ? undefined : "text-tertiary"}
          />
        }
        data-testid="schema-picker-button"
      >
        {hasSchema ? (
          schema
        ) : (
          <Text c="text-secondary" fw={700}>
            {t`Pick a schema to view`}
          </Text>
        )}
      </Button>
    </MiniPicker>
  );
}
