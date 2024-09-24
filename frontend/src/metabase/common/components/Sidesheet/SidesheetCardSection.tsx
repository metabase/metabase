import type React from "react";

import CS from "metabase/css/core/index.css";
import { Box, type MantineStyleSystemProps, Title } from "metabase/ui";

interface SidesheetCardSectionProps {
  title?: string;
  children: React.ReactNode;
  styleProps?: Partial<MantineStyleSystemProps>;
}

export const SidesheetCardSection = ({
  title,
  children,
  ...styleProps
}: SidesheetCardSectionProps) => {
  return (
    <Box {...styleProps}>
      {title && (
        <Title lh="1rem" mb="sm" size="sm" color="text-light">
          {title}
        </Title>
      )}
      <Box className={CS.textMedium}>{children}</Box>
    </Box>
  );
};
