import cx from "classnames";
import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didMountRef = useRef(false);

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

  const applyLimit = () => {
    const parsed = parseInt(value, 10);
    onChangeLimit(parsed > 0 ? parsed : null);
    onClose();
  };

  return (
    <Box
      ref={containerRef}
      className={cx(className, CS.textBold, CS.textMedium)}
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
            onChangeLimit(null);
          } else {
            setIsCustom(true);
            const parsed = parseInt(value, 10);
            onChangeLimit(parsed > 0 ? parsed : DEFAULT_LIMIT);
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
            onBlur={(e: FocusEvent<HTMLInputElement>) => {
              const nextFocused = e.relatedTarget as Node | null;
              if (containerRef.current?.contains(nextFocused)) {
                return;
              }
              applyLimit();
            }}
            onKeyPress={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.nativeEvent.isComposing) {
                return;
              }
              if (e.key === "Enter") {
                applyLimit();
              }
            }}
          />
        </Box>
      )}
    </Box>
  );
};
