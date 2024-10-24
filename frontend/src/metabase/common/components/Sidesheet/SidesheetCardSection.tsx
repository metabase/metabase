import type React from "react";

import CS from "metabase/css/core/index.css";
import { Box, type MantineStyleProps, Title } from "metabase/ui";

interface SidesheetCardSectionProps {
  title?: string;
  children: React.ReactNode;
  styleProps?: Partial<MantineStyleProps>;
}

export const SidesheetCardSection = ({
  title,
  children,
  ...styleProps
}: SidesheetCardSectionProps) => {
  return (
    <Box {...styleProps}>
      {title && (
        <Title mb="sm" size="sm" c="text-light">
          {title}
        </Title>
      )}
      <Box className={CS.textMedium}>{children}</Box>
    </Box>
  );
};
