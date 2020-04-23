import React from "react";

import { t } from "ttag";
import cx from "classnames";
import Input from "metabase/components/Input";
import Radio from "metabase/components/Radio";

const CustomRowLimit = ({ limit, onChangeLimit, onClose }) => {
  return (
    <Input
      small
      defaultValue={limit}
      className={cx({ "text-brand border-brand": limit != null })}
      placeholder={t`Pick a limit`}
      onKeyPress={e => {
        if (e.key === "Enter") {
          const value = parseInt(e.target.value, 10);
          if (value > 0) {
            onChangeLimit(value);
          } else {
            onChangeLimit(null);
          }
          if (onClose) {
            onClose();
          }
        }
      }}
    />
  );
};

const LimitPopover = ({ limit, onChangeLimit, onClose, className }) => (
  <div className={cx(className, "text-bold text-medium")}>
    <Radio
      vertical
      value={limit == null ? "maximum" : "custom"}
      options={[
        { name: t`Show maximum`, value: "maximum" },
        {
          name: (
            <CustomRowLimit
              key={limit == null ? "a" : "b"}
              limit={limit}
              onChangeLimit={onChangeLimit}
              onClose={onClose}
            />
          ),
          value: "custom",
        },
      ]}
      onChange={value =>
        value === "maximum" ? onChangeLimit(null) : onChangeLimit(2000)
      }
    />
  </div>
);

export default LimitPopover;
