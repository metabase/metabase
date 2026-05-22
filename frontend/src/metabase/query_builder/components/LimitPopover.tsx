import cx from "classnames";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Radio } from "metabase/common/components/Radio";
import CS from "metabase/css/core/index.css";
import { LimitInput } from "metabase/querying/components/LimitInput";
import { Box } from "metabase/ui";
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
  // discarded instead of applied on unmount (Enter/outside-click still commit).
  const cancelRef = useRef(false);

  const parsedValue = parseInt(value, 10);
  const selectedLimit = isCustom && parsedValue > 0 ? parsedValue : null;

  // Commit the selected limit when the popover is dismissed (unmounted), but
  // only when it differs from the current limit. Both radios and the typed
  // value are local-only until this point, so Escape can discard them.
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
          onClose();
        }
      }}
    >
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
          } else {
            // Activating custom is handled by the input's onFocus
            inputRef.current?.focus();
            inputRef.current?.select();
          }
        }}
      />
      <Box mt="sm" ml="1.25rem">
        <LimitInput
          ref={inputRef}
          small
          value={value}
          className={cx({ [cx(CS.textBrand, CS.borderBrand)]: isCustom })}
          placeholder={t`Pick a limit`}
          onFocus={() => setIsCustom(true)}
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
    </Box>
  );
};
