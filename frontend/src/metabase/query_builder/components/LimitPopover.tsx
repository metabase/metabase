import cx from "classnames";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Radio } from "metabase/common/components/Radio";
import CS from "metabase/css/core/index.css";
import { LimitInput } from "metabase/querying/components/LimitInput";
import { Box } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

const DEFAULT_LIMIT = 2000;

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
}: LimitPopoverProps) => {
  const [isCustom, setIsCustom] = useState(limit != null);
  const [value, setValue] = useState(
    limit != null ? String(limit) : String(DEFAULT_LIMIT),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const didMountRef = useRef(false);

  const parsedValue = parseInt(value, 10);
  const selectedLimit = isCustom && parsedValue > 0 ? parsedValue : null;

  // Apply the typed value when the popover is dismissed (unmounted), but only
  // when it differs from the current limit. This applies the value on close
  // whether the user clicks inside or outside the popover, and avoids an extra
  // data table reload when nothing changed.
  const selectedLimitRef = useRef(selectedLimit);
  selectedLimitRef.current = selectedLimit;
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const onChangeLimitRef = useRef(onChangeLimit);
  onChangeLimitRef.current = onChangeLimit;

  useEffect(() => {
    return () => {
      if (selectedLimitRef.current !== limitRef.current) {
        onChangeLimitRef.current(selectedLimitRef.current);
      }
    };
  }, []);

  // Focus and select the input only when the user actively switches to the
  // custom option, not when the popover opens with a custom limit already set.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (isCustom) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isCustom]);

  return (
    <Box className={cx(className, CS.textBold, CS.textMedium)}>
      <Radio
        vertical
        value={isCustom ? "custom" : "maximum"}
        options={[
          {
            name: t`Show maximum (first ${formatNumber(HARD_ROW_LIMIT)})`,
            value: "maximum",
          },
          {
            name: t`Set custom limit`,
            value: "custom",
          },
        ]}
        onChange={(selected: string) => {
          if (selected === "maximum") {
            setIsCustom(false);
            onChangeLimit(null);
          } else {
            setIsCustom(true);
            onChangeLimit(parsedValue > 0 ? parsedValue : DEFAULT_LIMIT);
          }
        }}
      />
      {isCustom && (
        <Box mt="sm" ml="1.25rem">
          <LimitInput
            ref={inputRef}
            small
            value={value}
            placeholder={t`Pick a limit`}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setValue(e.target.value)
            }
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.nativeEvent.isComposing) {
                return;
              }
              if (e.key === "Enter") {
                onClose();
              }
            }}
          />
        </Box>
      )}
    </Box>
  );
};
