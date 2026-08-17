import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { LimitInput } from "metabase/querying/components/LimitInput";
import { Box, Radio, Stack } from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

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
    limit != null ? String(limit) : String(HARD_ROW_LIMIT),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when the popover is dismissed with Escape so the pending value is
  // discarded instead of applied on unmount
  const cancelRef = useRef(false);

  const parsedValue = parseInt(value, 10);
  const selectedLimit = isCustom && parsedValue > 0 ? parsedValue : null;

  const selectedLimitRef = useLatest(selectedLimit);
  const limitRef = useLatest(limit);
  const onChangeLimitRef = useLatest(onChangeLimit);

  useEffect(() => {
    const applyPendingLimit = () => {
      if (cancelRef.current) {
        return;
      }
      if (selectedLimitRef.current !== limitRef.current) {
        onChangeLimitRef.current(selectedLimitRef.current);
      }
    };
    return () => applyPendingLimit();
  }, [selectedLimitRef, limitRef, onChangeLimitRef]);

  return (
    <Box
      className={cx(className, CS.textBold, CS.textMedium)}
      onKeyDownCapture={(e) => {
        if (e.key === "Escape") {
          cancelRef.current = true;
        }
      }}
    >
      <Radio.Group
        value={isCustom ? "custom" : "maximum"}
        onChange={(selected) => {
          if (selected === "maximum") {
            setIsCustom(false);
          } else {
            setIsCustom(true);
            inputRef.current?.focus();
            inputRef.current?.select();
          }
        }}
      >
        <Stack gap="sm">
          <Radio
            value="maximum"
            label={t`Show maximum (first ${formatNumber(HARD_ROW_LIMIT)})`}
          />
          <Radio value="custom" label={t`Set custom limit`} />
        </Stack>
      </Radio.Group>
      <Box mt="sm" ml="1.7rem">
        <LimitInput
          ref={inputRef}
          small
          value={value}
          className={cx({ [cx(CS.textBrand, CS.borderBrand)]: isCustom })}
          placeholder={t`Pick a limit`}
          onFocus={() => setIsCustom(true)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) {
              return;
            }
            if (e.key === "Enter") {
              onClose();
            }
          }}
        />
      </Box>
    </Box>
  );
};
