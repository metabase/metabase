import cx from "classnames";
import type { KeyboardEvent } from "react";
import { t } from "ttag";

import { Radio } from "metabase/common/components/Radio";
import CS from "metabase/css/core/index.css";
import { formatNumber } from "metabase/lib/formatting";
import { LimitInput } from "metabase/query_builder/components/LimitInput";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

interface CustomRowLimitProps {
  limit: number | null;
  onChangeLimit: (limit: number | null) => void;
  onClose: () => void;
}

const CustomRowLimit = ({
  limit,
  onChangeLimit,
  onClose,
}: CustomRowLimitProps) => {
  return (
    <LimitInput
      small
      defaultValue={limit ?? undefined}
      className={cx({ [cx(CS.textBrand, CS.borderBrand)]: limit != null })}
      placeholder={t`Pick a limit`}
      onKeyPress={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) {
          return;
        }
        if (e.key === "Enter") {
          const value = parseInt(e.currentTarget.value, 10);
          if (value > 0) {
            onChangeLimit(value);
          } else {
            onChangeLimit(null);
          }
          onClose();
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
}

export const LimitPopover = ({
  limit,
  onChangeLimit,
  onClose,
  className,
}: LimitPopoverProps) => (
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
