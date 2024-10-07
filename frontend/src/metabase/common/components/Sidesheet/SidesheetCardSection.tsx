import type React from "react";

import CS from "metabase/css/core/index.css";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { Box, type MantineStyleSystemProps, Title } from "metabase/ui";

interface SidesheetCardSectionProps {
  title?: string;
  titleId?: string;
  children: React.ReactNode;
  styleProps?: Partial<MantineStyleSystemProps>;
}

export const SidesheetCardSection = ({
  title,
  titleId,
  children,
  ...styleProps
}: SidesheetCardSectionProps) => {
  const generatedTitleId = useUniqueId("sidesheet-card-section-title");
  titleId ||= generatedTitleId;
  return (
    <Box {...styleProps} aria-labelledby={titleId}>
      {title && (
        <Title id={titleId} mb="sm" size="sm" color="text-light">
          {title}
        </Title>
      )}
      <Box className={CS.textMedium}>{children}</Box>
    </Box>
  );
};
