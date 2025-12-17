/* eslint-disable react/prop-types */
import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import Radio from "metabase/common/components/Radio";
import CS from "metabase/css/core/index.css";
import { formatNumber } from "metabase/lib/formatting";
import LimitInput from "metabase/query_builder/components/LimitInput";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

const CustomRowLimit = ({ limit, onChangeLimit, onClose, maxRowLimit }) => {
  const [inputValue, setInputValue] = useState(limit ?? "");
  const numericValue = parseInt(inputValue, 10);
  const exceedsMax = !isNaN(numericValue) && numericValue > maxRowLimit;

  return (
    <LimitInput
      small
      value={inputValue}
      className={cx({
        [cx(CS.textBrand, CS.borderBrand)]: limit != null && !exceedsMax,
      })}
      style={exceedsMax ? { borderColor: "var(--mb-color-error)" } : undefined}
      placeholder={t`Pick a limit`}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyPress={(e) => {
        if (e.nativeEvent.isComposing) {
          return;
        }
        if (e.key === "Enter") {
          const value = parseInt(e.target.value, 10);
          if (value > 0 && value <= maxRowLimit) {
            onChangeLimit(value);
            if (onClose) {
              onClose();
            }
          } else if (value > maxRowLimit) {
            // Don't close or submit if value exceeds max
            return;
          } else {
            onChangeLimit(null);
            if (onClose) {
              onClose();
            }
          }
        }
      }}
    />
  );
};

const LimitPopover = ({
  limit,
  onChangeLimit,
  onClose,
  className,
  maxRowLimit,
}) => {
  const effectiveMaxLimit = maxRowLimit ?? HARD_ROW_LIMIT;

  return (
    <div className={cx(className, CS.textBold, CS.textMedium)}>
      <Radio
        vertical
        value={limit == null ? "maximum" : "custom"}
        options={[
          {
            name: t`Show maximum (first ${formatNumber(effectiveMaxLimit)})`,
            value: "maximum",
          },
          {
            name: (
              <CustomRowLimit
                key={limit == null ? "a" : "b"}
                limit={limit}
                onChangeLimit={onChangeLimit}
                onClose={onClose}
                maxRowLimit={effectiveMaxLimit}
              />
            ),
            value: "custom",
          },
        ]}
        onChange={(value) =>
          value === "maximum"
            ? onChangeLimit(null)
            : onChangeLimit(effectiveMaxLimit)
        }
      />
    </div>
  );
};

export default LimitPopover;
