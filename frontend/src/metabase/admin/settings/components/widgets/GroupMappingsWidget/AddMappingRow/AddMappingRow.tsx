import React, { useState } from "react";

import { t } from "ttag";

import Button from "metabase/core/components/Button";

type AddMappingRowProps = {
  mappings: any;
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

  const handleCancelClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    onCancel && onCancel();
    setValue("");
  };

  const isValid = value && mappings[value] === undefined;

  return (
    <tr>
      <td colSpan={3} style={{ padding: 0 }}>
        <form
          className="my2 pl1 p1 bordered border-brand rounded relative flex align-center"
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
          <span
            className="link no-decoration cursor-pointer"
            onClick={handleCancelClick}
          >{t`Cancel`}</span>
          <Button
            className="ml2"
            type="submit"
            primary={!!isValid}
            disabled={!isValid}
          >{t`Add`}</Button>
        </form>
      </td>
    </tr>
  );
}

export default AddMappingRow;
