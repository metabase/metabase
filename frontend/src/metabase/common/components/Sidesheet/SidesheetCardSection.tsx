import type React from "react";

import CS from "metabase/css/core/index.css";
import { Box, type MantineStyleSystemProps } from "metabase/ui";

import { SidesheetCardTitle } from "./SidesheetCard";

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
      {title && <SidesheetCardTitle>{title}</SidesheetCardTitle>}
      <Box className={CS.textMedium}>{children}</Box>
    </Box>
  );
};
