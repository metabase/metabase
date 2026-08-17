import { useState } from "react";
import { t } from "ttag";

import type { MappingsType } from "metabase/admin/types";
import { Button, Flex, Group } from "metabase/ui";

import S from "./AddMappingRow.module.css";

type AddMappingRowProps = {
  mappings: MappingsType;
  placeholder: string;
  onCancel: () => void;
  onAdd: (value: string) => void | Promise<void>;
};

export function AddMappingRow({
  mappings,
  placeholder,
  onCancel,
  onAdd,
}: AddMappingRowProps) {
  const [value, setValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // don't natively submit an enclosing settings form
      e.preventDefault();
      if (isMappingNameUnique) {
        handleAdd();
      }
    }
  };

  const handleAdd = async () => {
    await onAdd(value);
    setValue("");
  };

  const handleCancelClick = () => {
    onCancel();
    setValue("");
  };

  const isMappingNameUnique = value && mappings[value] === undefined;

  return (
    <Flex
      align="center"
      justify="space-between"
      bd="1px solid var(--mb-color-core-brand)"
      bdrs="md"
      m="md"
      p="sm"
    >
      <input
        aria-label={t`New group mapping name`}
        className={S.input}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <Group gap="md">
        <Button
          variant="subtle"
          onClick={handleCancelClick}
        >{t`Cancel`}</Button>
        <Button
          type="button"
          variant={isMappingNameUnique ? "filled" : "default"}
          disabled={!isMappingNameUnique}
          onClick={() => (isMappingNameUnique ? handleAdd() : undefined)}
        >{t`Add`}</Button>
      </Group>
    </Flex>
  );
}
