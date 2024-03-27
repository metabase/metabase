import { useCallback, useState } from "react";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Button from "metabase/core/components/Button";
import NumericInput from "metabase/core/components/NumericInput";
import CS from "metabase/css/core/index.css";

import { normalizeCacheTTL } from "../../utils";

import { Text, CacheSectionRoot, CachePopover } from "./CacheSection.styled";

interface CacheSectionProps {
  initialCacheTTL: number | null;
  onSave: (cache_ttl: number | null) => Promise<any>;
}

const CacheSection = ({ initialCacheTTL, onSave }: CacheSectionProps) => {
  const [cacheTTL, setCacheTTL] = useState(initialCacheTTL);

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
            className={CS.textBrand}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CacheSection;
