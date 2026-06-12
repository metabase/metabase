import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import type { MappingsType } from "metabase/admin/types";
import CS from "metabase/css/core/index.css";
import { Button } from "metabase/ui";

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
            aria-label={t`New group mapping name`}
            className={cx(CS.inputBorderless, CS.h3, CS.ml1, CS.flexFull)}
            type="text"
            value={value}
            placeholder={placeholder}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div>
            <Button
              variant="subtle"
              onClick={handleCancelClick}
            >{t`Cancel`}</Button>
            <Button
              className={CS.ml2}
              type="button"
              variant={isMappingNameUnique ? "filled" : "default"}
              disabled={!isMappingNameUnique}
              onClick={() => (isMappingNameUnique ? handleAdd() : undefined)}
            >{t`Add`}</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AddMappingRow;
