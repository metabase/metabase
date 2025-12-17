import cx from "classnames";
import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import { Radio } from "metabase/common/components/Radio";
import CS from "metabase/css/core/index.css";
import { formatNumber } from "metabase/lib/formatting";
import { LimitInput } from "metabase/querying/components/LimitInput";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

interface CustomRowLimitProps {
  limit: number | null;
  onChangeLimit: (limit: number | null) => void;
  onClose: () => void;
  maxRowLimit: number;
}

const CustomRowLimit = ({
  limit,
  onChangeLimit,
  onClose,
  maxRowLimit,
}: CustomRowLimitProps) => {
  const [inputValue, setInputValue] = useState(
    limit != null ? String(limit) : "",
  );
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
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        setInputValue(e.target.value)
      }
      onKeyPress={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) {
          return;
        }
        if (e.key === "Enter") {
          const value = parseInt(e.currentTarget.value, 10);
          if (value > 0 && value <= maxRowLimit) {
            onChangeLimit(value);
            onClose?.();
          } else if (value > maxRowLimit) {
            // Don't close or submit if value exceeds max
            return;
          } else {
            onChangeLimit(null);
            onClose?.();
          }
        }
      }}
    />
  );
};

interface LimitPopoverProps {
  limit: number | null;
  onChangeLimit: (limit: number | null) => void;
  onClose: () => void;
  className?: string;
  maxRowLimit?: number;
}

export const LimitPopover = ({
  limit,
  onChangeLimit,
  onClose,
  className,
  maxRowLimit,
}: LimitPopoverProps) => {
  const effectiveMaxLimit = maxRowLimit ?? HARD_ROW_LIMIT;

  return (
    <div className={cx(className, CS.textBold, CS.textMedium)}>
      <Radio
        vertical
        value={limit == null ? "maximum" : "custom"}
        options={[
          {
            name: t`Show maximum (first ${formatNumber(HARD_ROW_LIMIT)})`,
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
        onChange={(value: string) =>
          value === "maximum" ? onChangeLimit(null) : onChangeLimit(2000)
        }
      />
    </div>
  );
};
