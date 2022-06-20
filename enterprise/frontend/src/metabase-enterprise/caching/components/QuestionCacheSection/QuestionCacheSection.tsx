import React, { useCallback, useState } from "react";
import { t } from "ttag";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Button from "metabase/core/components/Button";
import ActionButton from "metabase/components/ActionButton";
import NumericInput from "metabase/core/components/NumericInput";

import Question from "metabase-lib/lib/Question";
import { color } from "metabase/lib/colors";

import { normalizeCacheTTL } from "../../utils";

import {
  Text,
  QuestionCacheSectionRoot,
  CachePopover,
} from "./QuestionCacheSection.styled";

interface QuestionCacheSectionProps {
  question: Question;
  onSave: (cache_ttl: number | null) => Promise<Question>;
}

export const QuestionCacheSection = ({
  question,
  onSave,
}: QuestionCacheSectionProps) => {
  const [cacheTTL, setCacheTTL] = useState<number | null>(question.cache_ttl());

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
    <QuestionCacheSectionRoot>
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
    </QuestionCacheSectionRoot>
  );
};
