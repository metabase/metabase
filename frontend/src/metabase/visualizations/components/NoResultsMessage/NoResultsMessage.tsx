import { Markdown } from "metabase/common/components/Markdown";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { Box, Tooltip } from "metabase/ui";
import { useIsTruncated } from "metabase/ui/hooks/use-is-truncated";

import S from "./NoResultsMessage.module.css";

const DISALLOWED_ELEMENTS = ["img"];
const COMPACT_MAX_LINES = 3;
const TOOLTIP_MAX_WIDTH = "22em";
// A box that fits can still end up a fraction of a pixel shorter than its text.
const CLIP_TOLERANCE_PX = 1;

interface NoResultsMessageProps {
  message: string;
  isCompact?: boolean;
}

/**
 * The author's no-results message, in the style every host shares. When
 * clipped, it fades out and shows the full text on hover.
 */
export function NoResultsMessage({
  message,
  isCompact = false,
}: NoResultsMessageProps) {
  const tc = useTranslateContent();
  const translatedMessage = tc(message);
  const { isTruncated, ref } = useIsTruncated<HTMLDivElement>({
    tolerancePx: CLIP_TOLERANCE_PX,
  });

  return (
    <Tooltip
      label={
        <Markdown
          dark
          disallowHeading
          unstyleLinks
          disallowedElements={DISALLOWED_ELEMENTS}
        >
          {translatedMessage}
        </Markdown>
      }
      maw={TOOLTIP_MAX_WIDTH}
      disabled={!isTruncated}
    >
      <Box
        ref={ref}
        className={S.message}
        data-testid="no-results-message"
        data-compact={isCompact || undefined}
        data-clipped={isTruncated || undefined}
      >
        <Markdown
          disallowHeading
          disallowedElements={DISALLOWED_ELEMENTS}
          lineClamp={isCompact ? COMPACT_MAX_LINES : undefined}
        >
          {translatedMessage}
        </Markdown>
      </Box>
    </Tooltip>
  );
}
