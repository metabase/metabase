import cx from "classnames";
import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { formatNumber } from "metabase/lib/formatting";
import { NumberInput, Radio, Stack } from "metabase/ui";
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
    <NumberInput
      size="sm"
      allowDecimal={false}
      allowNegative={false}
      value={inputValue}
      className={cx({
        [cx(CS.textBrand, CS.borderBrand)]: limit != null && !exceedsMax,
      })}
      error={exceedsMax && t`Value exceeds maximum of ${maxRowLimit}`}
      placeholder={t`Pick a limit`}
      onChange={(value: number | string) => setInputValue(value.toString())}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
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
      <Radio.Group
        value={limit == null ? "maximum" : "custom"}
        onChange={(value: string) =>
          value === "maximum"
            ? onChangeLimit(null)
            : onChangeLimit(effectiveMaxLimit)
        }
      >
        <Stack>
          <Radio
            value="maximum"
            label={t`Show maximum (first ${formatNumber(effectiveMaxLimit)})`}
          />
          <Radio
            value="custom"
            label={
              <CustomRowLimit
                limit={limit}
                onChangeLimit={onChangeLimit}
                onClose={onClose}
                maxRowLimit={effectiveMaxLimit}
              />
            }
            styles={{
              inner: {
                marginTop: "0.5rem",
              },
            }}
          />
        </Stack>
      </Radio.Group>
    </div>
  );
};
