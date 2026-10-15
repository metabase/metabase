import cx from "classnames";
import type { ReactNode } from "react";

import { Markdown } from "metabase/common/components/Markdown";
import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Tooltip, rem } from "metabase/ui";

import S from "./ScalarLabel.module.css";

const DESCRIPTION_ICON_SIZE = 16;
const DESCRIPTION_ICON_GAP = 4;

interface ScalarLabelProps {
  children: ReactNode;
  description?: string | null;
  xPadding: number;
}

export function ScalarLabel({
  children,
  description,
  xPadding,
}: ScalarLabelProps) {
  const tc = useTranslateContent();
  // Reserve equal space on both sides where the icon exceeds the card padding.
  const iconSpace = Math.max(
    DESCRIPTION_ICON_SIZE + DESCRIPTION_ICON_GAP - xPadding,
    0,
  );

  return (
    <Flex
      pos="relative"
      align="center"
      justify="center"
      gap="xxs"
      miw={0}
      maw={description ? `calc(100% - ${rem(2 * iconSpace)})` : "100%"}
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
            className={cx(
              S.descriptionIcon,
              CS.hoverChild,
              CS.hoverChildSmooth,
            )}
          >
            <Icon name="info" size={DESCRIPTION_ICON_SIZE} />
          </Box>
        </Tooltip>
      )}
    </Flex>
  );
}
