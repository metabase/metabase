import React, { useCallback, useState } from "react";
import { t } from "ttag";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Button from "metabase/core/components/Button";
import ActionButton from "metabase/components/ActionButton";
import NumericInput from "metabase/core/components/NumericInput";
import { color } from "metabase/lib/colors";

import { normalizeCacheTTL } from "../../utils";

import { Text, CacheSectionRoot, CachePopover } from "./CacheSection.styled";

type CACHE_TTL = number | null;

interface CacheSectionProps {
  initialCacheTTL: CACHE_TTL;
  onSave: (cache_ttl: CACHE_TTL) => Promise<any>;
}

export const CacheSection = ({
  initialCacheTTL,
  onSave,
}: CacheSectionProps) => {
  const [cacheTTL, setCacheTTL] = useState<CACHE_TTL>(initialCacheTTL);

  const handleChange = useCallback(
    number => {
      setCacheTTL(normalizeCacheTTL(number));
    },
    [setCacheTTL],
  );

  const handleSave = useCallback(async () => {
    return await onSave(cacheTTL);
  }, [onSave, cacheTTL]);

  return (
    <CacheSectionRoot>
      <TippyPopoverWithTrigger
        key="extra-actions-menu"
        placement="bottom-start"
        renderTrigger={({ onClick, visible }) => (
          <Button
            borderless
            color={color("brand")}
            onClick={onClick}
            iconRight={visible ? "chevronup" : "chevrondown"}
          >
            {t`Cache Configuration`}
          </Button>
        )}
        popoverContent={
          <CachePopover>
            <Text>
              {t`Cache results for`}
              <NumericInput
                placeholder="24"
                value={cacheTTL || ""}
                onChange={handleChange}
                data-testid="question-cache-ttl-input"
              />
              {t`hours`}
            </Text>
            <ActionButton
              primary
              actionFn={handleSave}
            >{t`Save changes`}</ActionButton>
          </CachePopover>
        }
      />
    </CacheSectionRoot>
  );
};
