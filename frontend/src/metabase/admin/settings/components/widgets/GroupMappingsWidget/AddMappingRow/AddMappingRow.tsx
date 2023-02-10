import React, { useState } from "react";

import { t } from "ttag";

import Button from "metabase/core/components/Button";

import type { MappingsType } from "../types";

type AddMappingRowProps = {
  mappings: MappingsType;
  placeholder: string;
  onCancel: () => void;
  onAdd: (value: string) => void;
};

function AddMappingRow({
  mappings,
  placeholder,
  onCancel,
  onAdd,
}: AddMappingRowProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onAdd && onAdd(value);
    setValue("");
  };

  const handleCancelClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onCancel && onCancel();
    setValue("");
  };

  const isValid = value && mappings[value] === undefined;

  return (
    <tr>
      <td colSpan={3} style={{ padding: 0 }}>
        <form
          className="m2 p1 bordered border-brand justify-between rounded relative flex align-center"
          onSubmit={isValid ? handleSubmit : undefined}
        >
          <input
            className="input--borderless h3 ml1 flex-full"
            type="text"
            value={value}
            placeholder={placeholder}
            autoFocus
            onChange={e => setValue(e.target.value)}
          />
          <div>
            <Button borderless onClick={handleCancelClick}>{t`Cancel`}</Button>
            <Button
              className="ml2"
              type="submit"
              primary={!!isValid}
              disabled={!isValid}
            >{t`Add`}</Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export default AddMappingRow;
