import cx from "classnames";
import type { JSX } from "react";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Box, Flex, Icon } from "metabase/ui";

import S from "./HelpCard.module.css";

export interface HelpCardProps {
  title: string;
  helpUrl: string;
  className?: string;
  isFullyClickable?: boolean;
  children: React.ReactNode;
}

export const HelpCard = ({
  title,
  helpUrl,
  isFullyClickable = true,
  className,
  children,
}: HelpCardProps): JSX.Element => {
  return (
    <Box
      component={isFullyClickable ? ExternalLink : undefined}
      href={isFullyClickable ? helpUrl : undefined}
      className={cx(S.root, { [S.clickable]: isFullyClickable }, className)}
    >
      <Flex
        component={isFullyClickable ? undefined : ExternalLink}
        href={isFullyClickable ? undefined : helpUrl}
        align="center"
        mb="lg"
      >
        <Icon name="info" flex="0 0 auto" c="core-brand" />
        <Box
          component="span"
          display="block"
          flex="1 1 auto"
          mx="sm"
          c="core-brand"
          fw="bold"
        >
          {title}
        </Box>
        <Icon name="external" flex="0 0 auto" c="core-brand" />
      </Flex>
      <Box className={S.message}>{children}</Box>
    </Box>
  );
};
