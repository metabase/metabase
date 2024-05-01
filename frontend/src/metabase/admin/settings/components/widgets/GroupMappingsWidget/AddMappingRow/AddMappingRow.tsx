import cx from "classnames";
import type * as React from "react";
import { useState } from "react";
import { t } from "ttag";

import type { MappingsType } from "metabase/admin/types";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";

type AddMappingRowProps = {
  mappings: MappingsType;
  placeholder: string;
  onCancel: () => void;
  onAdd: (value: string) => void | Promise<void>;
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

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    await onAdd(value);
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
        <div
          className={cx(
            CS.m2,
            CS.p1,
            CS.bordered,
            CS.borderBrand,
            CS.justifyBetween,
            CS.rounded,
            CS.relative,
            CS.flex,
            CS.alignCenter,
          )}
        >
          <input
            aria-label="new-group-mapping-name-input"
            className={cx(CS.inputBorderless, CS.h3, CS.ml1, CS.flexFull)}
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
              className={CS.ml2}
              type="submit"
              primary={!!isMappingNameUnique}
              disabled={!isMappingNameUnique}
              onClick={() => (isMappingNameUnique ? handleSubmit() : undefined)}
            >{t`Add`}</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AddMappingRow;
