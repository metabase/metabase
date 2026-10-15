import type { ReactNode } from "react";

import { Markdown } from "metabase/common/components/Markdown";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { Box, Flex, Icon, Tooltip, rem } from "metabase/ui";

import S from "./ScalarLabel.module.css";

const DESCRIPTION_ICON_SIZE = 16;
const DESCRIPTION_ICON_GAP = 8;
const DESCRIPTION_ICON_SPACE = DESCRIPTION_ICON_SIZE + DESCRIPTION_ICON_GAP;

interface ScalarLabelProps {
  children: ReactNode;
  description?: string | null;
}

export function ScalarLabel({ children, description }: ScalarLabelProps) {
  const tc = useTranslateContent();
  // Reserve equal icon space on both sides to keep the text centered and the icon inside the padding.
  const maxWidth = description
    ? `calc(100% - ${rem(2 * DESCRIPTION_ICON_SPACE)})`
    : "100%";

  return (
    <Flex
      pos="relative"
      align="center"
      justify="center"
      gap="xxs"
      miw={0}
      maw={maxWidth}
    >
      {children}
      {description && (
        <Tooltip
          label={
            <Markdown dark compact disallowHeading unstyleLinks lineClamp={8}>
              {tc(description)}
            </Markdown>
          }
          maw="22em"
        >
          <Box
            component="span"
            tabIndex={0}
            pos="absolute"
            left={`calc(100% + ${rem(DESCRIPTION_ICON_GAP)})`}
            className={S.descriptionIcon}
          >
            <Icon name="info" size={DESCRIPTION_ICON_SIZE} />
          </Box>
        </Tooltip>
      )}
    </Flex>
  );
}
