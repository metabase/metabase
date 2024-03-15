import cx from "classnames";
import type * as React from "react";
import { useState } from "react";
import { t } from "ttag";

import type { MappingsType } from "metabase/admin/types";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import InputS from "metabase/css/core/inputs.module.css";

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter key
    if (e.keyCode === 13) {
      handleSubmit();
    }
  };

  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    onAdd(value);
    setValue("");
  };

  const handleCancelClick = () => {
    onCancel();
    setValue("");
  };

  const isMappingNameUnique = value && mappings[value] === undefined;

  return (
    <tr>
      <td colSpan={3} style={{ padding: 0 }}>
        <form
          className="m2 p1 bordered border-brand justify-between rounded relative flex align-center"
          onSubmit={isMappingNameUnique ? handleSubmit : undefined}
        >
          <input
            aria-label="new-group-mapping-name-input"
            className={cx(InputS.InputBorderless, CS.h3, CS.ml1, CS.flexFull)}
            type="text"
            value={value}
            placeholder={placeholder}
            autoFocus
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div>
            <Button borderless onClick={handleCancelClick}>{t`Cancel`}</Button>
            <Button
              className="ml2"
              type="submit"
              primary={!!isMappingNameUnique}
              disabled={!isMappingNameUnique}
            >{t`Add`}</Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AddMappingRow;
